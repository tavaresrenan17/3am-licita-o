/**
 * WORKER DE COLETA EM TICKS.
 *
 * A produção roda em Cloudflare (nitro): não existe processo longo. Cada tick
 * tem orçamento de tempo curto, processa quantas páginas couberem e sempre para
 * num estado retomável. O checkpoint vive no banco, não em memória.
 *
 * Invariantes (arquivos 03 §7 e 05 §4):
 * - a rede acontece FORA da transação; o commit é a RPC `pncp_merge_page`;
 * - falha antes do commit não avança checkpoint — a página é relida no próximo tick;
 * - 400/422 é falha de contrato: o segmento morre, o tick continua nos outros;
 * - falha transitória encerra o tick e preserva o progresso já commitado;
 * - registro sem identidade não derruba o lote inteiro.
 */
import {
  buscarPagina,
  ErroContratoPNCP,
  FalhaTransitoriaPNCP,
  RespostaInvalidaPNCP,
  type FalhasTentativasPNCP,
} from "./client.server";
import type { EndpointPNCP, ParametrosConsulta } from "./contract";
import {
  deduplicarPorControle,
  mapearContratacao,
  RegistroInvalidoError,
  type ConfigScore,
  type ContratacaoPNCP,
  type LicitacaoRow,
} from "./mapper";

export interface SegmentoPersistido {
  id: string;
  /** Posse vigente deste segmento; devolvida ao banco quando o tick larga dele. */
  posseToken: string | null;
  endpoint: EndpointPNCP;
  /** Parâmetros do segmento sem `pagina`: a página vem do checkpoint. */
  query: Omit<ParametrosConsulta, "pagina">;
  proximaPagina: number;
  totalPaginasObservado: number | null;
}

export interface ResultadoMerge {
  aplicado: boolean;
  recebidos: number;
  novos: number;
  atualizados: number;
  ignorados: number;
  /** Recusados pela política de admissão: nem novos, nem ignorados. */
  naoAdmitidos: number;
  proximaPagina: number;
  segmentoConcluido: boolean;
}

/**
 * O que o catálogo aceita de uma página.
 *
 * `todas` é a descoberta por propostas, onde tudo que chega já é oportunidade
 * em aberto. `abertas` é o incremental: como a rota de atualização devolve
 * qualquer contratação que mudou — metade da janela medida em 15/09/2026 era
 * proposta encerrada —, um registro desconhecido só entra se ainda houver
 * proposta aberta. O que já está no catálogo é sempre atualizado.
 */
export type PoliticaAdmissao = "todas" | "abertas";

export interface EntradaMerge {
  segmentoId: string;
  pagina: number;
  totalPaginas: number | null;
  totalRegistros: number | null;
  linhas: LicitacaoRow[];
  admissao: PoliticaAdmissao;
}

export interface PayloadBruto {
  numeroControlePncp: string;
  hash: string;
  payload: unknown;
}

/** Porta de persistência: implementada pelo Supabase, trocável nos testes. */
export interface PortaIngestao {
  /** Entrega o próximo segmento JÁ com posse (for update skip locked). */
  proximoSegmento(jobId: string): Promise<SegmentoPersistido | null>;
  /** Devolve o segmento à fila. Sem isto ele ficaria preso até a posse expirar. */
  liberarSegmento(segmento: SegmentoPersistido): Promise<void>;
  mergePagina(entrada: EntradaMerge): Promise<ResultadoMerge>;
  salvarPayloads(endpoint: EndpointPNCP, itens: PayloadBruto[]): Promise<void>;
  registrarFalhaSegmento(segmentoId: string, motivo: string, definitiva: boolean): Promise<void>;
  finalizarJob(
    jobId: string,
    status: "concluido" | "concluido_com_erros" | "parcial" | "falhou",
    mensagem?: string | null,
  ): Promise<void>;
  registrarMetricasApi?(jobId: string, metricas: MetricasApiTick): Promise<void>;
}

export interface MetricasApiTick extends FalhasTentativasPNCP {
  requisicoes: number;
  sucessos: number;
  tentativas: number;
  latenciaTotalMs: number;
  latenciaMaxMs: number;
  /** Falhas desde a última resposta bem-sucedida dentro deste tick. */
  falhasConsecutivas: number;
  /** Permite zerar a sequência persistida quando houve sucesso neste tick. */
  reiniciarFalhasConsecutivas: boolean;
}

export interface OpcoesTick {
  banco: PortaIngestao;
  cfg: ConfigScore;
  buscar?: typeof buscarPagina;
  agora?: () => number;
  dormir?: (ms: number) => Promise<void>;
  /** Intervalo mínimo entre o início de duas páginas. Ver PADRAO. */
  intervaloPartidaMs?: number;
  /** Orçamento do tick; o padrão deixa folga sob o limite do runtime. */
  orcamentoMs?: number;
  /** Tempo mínimo que precisa sobrar para tentar mais uma página. */
  reservaMs?: number;
  maxPaginasPorTick?: number;
}

export interface ResumoTick {
  paginasAplicadas: number;
  recebidos: number;
  novos: number;
  atualizados: number;
  ignorados: number;
  naoAdmitidos: number;
  segmentosConcluidos: number;
  /** true quando não restam segmentos pendentes: o job terminou. */
  jobConcluido: boolean;
  erros: string[];
  duracaoMs: number;
  metricasApi: MetricasApiTick;
}

const dormirPadrao = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const PADRAO = {
  // Uma página do PNCP levou 30–60 s nas medições de 14/09/2026, então um ciclo
  // de 25 s não completava nenhuma. O orçamento fica abaixo do limite de ~100 s
  // que um proxy costuma impor à requisição, e a reserva cobre uma página lenta:
  // sobrando menos que isso, o tick encerra em estado retomável.
  orcamentoMs: 60_000,
  reservaMs: 35_000,
  maxPaginasPorTick: 40,
  // O PNCP corta rajada. Medições de 15/09/2026 contra /contratacoes/proposta,
  // medindo o intervalo entre PARTIDAS:
  //
  //   sem pausa  → bloqueou na 6ª requisição (429 em ~20 ms, sem Retry-After)
  //   1,5 s      → bloqueou na 7ª
  //   ~2,7 s     → 10 de 10 passaram
  //   3,0 s      → bloqueou na 2ª, mas a fonte já estava degradada (46 s por
  //                requisição, 500/504) — amostra contaminada, não comparável
  //
  // Os números não fecham entre si porque a variável não é só o nosso ritmo: a
  // tolerância do PNCP muda com o estado dele, que no mesmo dia oscilou entre
  // responder em 200 ms, limitar e devolver "Erro na comunicação com o banco de
  // dados". Então 4 s NÃO é um limite derivado: é um piso conservador, acima do
  // único ritmo que passou limpo, escolhido sob incerteza. Ajustar para menos
  // exige medir de novo com a fonte saudável.
  //
  // Enquanto o PNCP levava 30–60 s por página isto não aparecia — o tempo de
  // resposta espaçava as chamadas sozinho. Quando ficou rápido, o worker passou
  // a emendar páginas e SP (101 páginas) parava sempre na 6ª.
  //
  // O que de fato torna a coleta robusta não é acertar este número, é o tick
  // seguinte retomar do checkpoint: bloqueio vira atraso, nunca perda.
  intervaloPartidaMs: 4_000,
};

interface Mapeamento {
  linhas: LicitacaoRow[];
  payloads: PayloadBruto[];
  rejeitados: string[];
}

function mapearLote(
  itens: ContratacaoPNCP[],
  cfg: ConfigScore,
  vistoEmProposta: boolean,
  fetchedAt: string,
): Mapeamento {
  const linhas: LicitacaoRow[] = [];
  const payloads: PayloadBruto[] = [];
  const rejeitados: string[] = [];

  for (const item of itens) {
    try {
      const linha = mapearContratacao(item, { cfg, vistoEmProposta, fetchedAt });
      linhas.push(linha);
      payloads.push({
        numeroControlePncp: linha.numero_controle_pncp,
        hash: linha.source_hash,
        payload: item,
      });
    } catch (erro) {
      if (erro instanceof RegistroInvalidoError) {
        // Um registro problemático vira evidência, não motivo para descartar a
        // página inteira nem para declarar o segmento completo.
        rejeitados.push(erro.message);
        continue;
      }
      throw erro;
    }
  }

  return { linhas: deduplicarPorControle(linhas), payloads, rejeitados };
}

/**
 * Executa um tick de coleta do job informado.
 * Não lança por falha de rede: devolve o resumo com os erros observados, para
 * que a tela mostre progresso parcial em vez de perder o que já foi gravado.
 */
export async function executarTick(jobId: string, opcoes: OpcoesTick): Promise<ResumoTick> {
  const {
    banco,
    cfg,
    buscar = buscarPagina,
    agora = Date.now,
    dormir = dormirPadrao,
    orcamentoMs = PADRAO.orcamentoMs,
    reservaMs = PADRAO.reservaMs,
    maxPaginasPorTick = PADRAO.maxPaginasPorTick,
    intervaloPartidaMs = PADRAO.intervaloPartidaMs,
  } = opcoes;

  const inicio = agora();
  const resumo: ResumoTick = {
    paginasAplicadas: 0,
    recebidos: 0,
    novos: 0,
    atualizados: 0,
    ignorados: 0,
    naoAdmitidos: 0,
    segmentosConcluidos: 0,
    jobConcluido: false,
    erros: [],
    duracaoMs: 0,
    metricasApi: {
      requisicoes: 0,
      sucessos: 0,
      tentativas: 0,
      timeouts: 0,
      erros429: 0,
      erros5xx: 0,
      outras: 0,
      latenciaTotalMs: 0,
      latenciaMaxMs: 0,
      falhasConsecutivas: 0,
      reiniciarFalhasConsecutivas: false,
    },
  };

  const somarFalhas = (falhas?: FalhasTentativasPNCP) => {
    if (!falhas) return;
    resumo.metricasApi.timeouts += falhas.timeouts;
    resumo.metricasApi.erros429 += falhas.erros429;
    resumo.metricasApi.erros5xx += falhas.erros5xx;
    resumo.metricasApi.outras += falhas.outras;
  };

  const restante = () => orcamentoMs - (agora() - inicio);

  // Primeira página parte na hora; as seguintes respeitam o intervalo.
  let proximaPartida = inicio;

  while (resumo.paginasAplicadas < maxPaginasPorTick && restante() > reservaMs) {
    const segmento = await banco.proximoSegmento(jobId);

    if (!segmento) {
      resumo.jobConcluido = true;
      break;
    }

    // A posse sai em qualquer caminho — inclusive `continue` e `break`. Sem
    // isto a própria iteração seguinte não acharia o segmento (ele estaria
    // travado por nós mesmos) e o job seria declarado concluído após uma
    // página só.
    try {
      const params: ParametrosConsulta = { ...segmento.query, pagina: segmento.proximaPagina };

      // Espaça o início das páginas. Esperar aqui, e não depois da resposta, faz
      // o intervalo valer entre PARTIDAS: se a página anterior já demorou mais que
      // isso, não se espera nada e a coleta não fica artificialmente lenta.
      const espera = proximaPartida - agora();
      proximaPartida = Math.max(proximaPartida, agora()) + intervaloPartidaMs;
      if (espera > 0) {
        // Dormir além do que sobra do tick desperdiçaria o orçamento inteiro numa
        // pausa; melhor encerrar retomável e deixar a próxima volta continuar.
        if (espera >= restante()) break;
        await dormir(espera);
      }

      let resposta;
      const inicioRequisicao = agora();
      try {
        resposta = await buscar(segmento.endpoint, params, { orcamentoMs: restante() });
        resumo.metricasApi.requisicoes++;
        resumo.metricasApi.sucessos++;
        resumo.metricasApi.tentativas += resposta.tentativas;
        resumo.metricasApi.latenciaTotalMs += resposta.duracaoMs;
        resumo.metricasApi.latenciaMaxMs = Math.max(
          resumo.metricasApi.latenciaMaxMs,
          resposta.duracaoMs,
        );
        resumo.metricasApi.falhasConsecutivas = 0;
        resumo.metricasApi.reiniciarFalhasConsecutivas = true;
        somarFalhas(resposta.falhas);
      } catch (erro) {
        const motivo = erro instanceof Error ? erro.message : String(erro);
        const duracaoFalha =
          erro instanceof FalhaTransitoriaPNCP ? erro.duracaoMs : agora() - inicioRequisicao;
        const tentativas = erro instanceof FalhaTransitoriaPNCP ? erro.tentativas : 1;
        resumo.metricasApi.requisicoes++;
        resumo.metricasApi.tentativas += tentativas;
        resumo.metricasApi.latenciaTotalMs += duracaoFalha;
        resumo.metricasApi.latenciaMaxMs = Math.max(resumo.metricasApi.latenciaMaxMs, duracaoFalha);
        resumo.metricasApi.falhasConsecutivas += tentativas;
        if (erro instanceof FalhaTransitoriaPNCP) somarFalhas(erro.falhas);
        else resumo.metricasApi.outras++;

        if (erro instanceof ErroContratoPNCP || erro instanceof RespostaInvalidaPNCP) {
          // Repetir a mesma requisição inválida não adianta: encerra o segmento e
          // segue para os outros, sem contaminar o restante da coleta.
          await banco.registrarFalhaSegmento(segmento.id, motivo, true);
          resumo.erros.push(`${segmento.id}: ${motivo}`);
          continue;
        }

        // Transitório: preserva o checkpoint e deixa para o próximo tick.
        await banco.registrarFalhaSegmento(segmento.id, motivo, false);
        resumo.erros.push(`${segmento.id}: ${motivo}`);
        break;
      }

      const fetchedAt = new Date(agora()).toISOString();
      const itens = resposta.envelope?.data ?? [];
      const { linhas, payloads, rejeitados } =
        resposta.status === 204
          ? { linhas: [], payloads: [], rejeitados: [] }
          : mapearLote(itens, cfg, segmento.endpoint === "proposta", fetchedAt);

      if (rejeitados.length > 0) {
        resumo.erros.push(...rejeitados.map((r) => `${segmento.id}: ${r}`));
      }

      try {
        if (payloads.length > 0) {
          try {
            await banco.salvarPayloads(segmento.endpoint, payloads);
          } catch (erro) {
            // O payload bruto é auditoria, não o dado que a tela mostra. Falhar
            // aqui não pode descartar uma página já baixada da fonte: registra-se
            // o problema e a gravação do catálogo segue.
            const motivo = erro instanceof Error ? erro.message : String(erro);
            resumo.erros.push(`${segmento.id}: payload bruto não guardado — ${motivo}`);
          }
        }

        const merge = await banco.mergePagina({
          segmentoId: segmento.id,
          pagina: segmento.proximaPagina,
          totalPaginas: resposta.envelope?.totalPaginas ?? null,
          totalRegistros: resposta.envelope?.totalRegistros ?? null,
          linhas,
          // Descoberta traz só proposta aberta por definição da rota; atualização
          // traz tudo que mudou, e aí a política precisa agir.
          admissao: segmento.endpoint === "atualizacao" ? "abertas" : "todas",
        });

        if (merge.aplicado) {
          resumo.paginasAplicadas++;
          resumo.recebidos += merge.recebidos;
          resumo.novos += merge.novos;
          resumo.atualizados += merge.atualizados;
          resumo.ignorados += merge.ignorados;
          resumo.naoAdmitidos += merge.naoAdmitidos;
        }
        if (merge.segmentoConcluido) resumo.segmentosConcluidos++;
      } catch (erro) {
        // Falha ao gravar: o checkpoint não avançou, então a página será relida.
        const motivo = erro instanceof Error ? erro.message : String(erro);
        await banco.registrarFalhaSegmento(segmento.id, motivo, false);
        resumo.erros.push(`${segmento.id}: ${motivo}`);
        break;
      }
    } finally {
      await banco.liberarSegmento(segmento);
    }
  }

  if (resumo.metricasApi.requisicoes > 0 && banco.registrarMetricasApi) {
    try {
      await banco.registrarMetricasApi(jobId, resumo.metricasApi);
    } catch (erro) {
      // Telemetria não participa do checkpoint. Uma falha ao gravá-la não pode
      // reabrir uma página já aplicada nem impedir a conclusão do catálogo.
      console.warn(
        "Não foi possível registrar a saúde da API do PNCP:",
        erro instanceof Error ? erro.message : erro,
      );
    }
  }

  if (resumo.jobConcluido) {
    await banco.finalizarJob(
      jobId,
      resumo.erros.length > 0 ? "concluido_com_erros" : "concluido",
      resumo.erros.length > 0 ? resumo.erros.slice(0, 5).join(" | ") : null,
    );
  }

  resumo.duracaoMs = agora() - inicio;
  return resumo;
}
