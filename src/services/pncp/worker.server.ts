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
  /** Há trabalho não concluído, mesmo que tudo esteja temporariamente em cooldown. */
  haSegmentosPendentes?(jobId: string): Promise<boolean>;
  /**
   * Ms até o próximo segmento sair de cooldown. Permite ao worker decidir se
   * vale esperar dentro do orçamento ou devolver o tick vazio.
   */
  proximoCooldown?(jobId: string): Promise<number | null>;
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
  /** Tempo deliberadamente aguardado pelo limitador entre páginas. */
  esperaLimitadorMs: number;
  /** Intervalo vigente ao terminar o tick. */
  intervaloFinalMs: number;
  /** Maior número de requisições simultâneas observado no tick. */
  concorrenciaMaxObservada: number;
  /** Limite de concorrência vigente ao terminar o tick. */
  concorrenciaFinal: number;
}

export interface OpcoesTick {
  banco: PortaIngestao;
  cfg: ConfigScore;
  buscar?: typeof buscarPagina;
  agora?: () => number;
  dormir?: (ms: number) => Promise<void>;
  /** Intervalo mínimo entre o início de duas páginas. Ver PADRAO. */
  intervaloPartidaMs?: number;
  /** Desative para benchmarks que precisam de ritmo rigorosamente fixo. */
  ritmoAdaptativo?: boolean;
  /** Máximo de segmentos independentes em voo. Páginas do mesmo segmento não concorrem. */
  concorrenciaMax?: number;
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
  /** true quando o tick parou sem progresso porque todos os segmentos estão
   *  em cooldown após falha transitória. Distingue de "falha real" no frontend. */
  aguardandoCooldown: boolean;
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
  // dados". Por isso o ritmo agora parte de 3 s: após respostas limpas desce
  // gradualmente até 2,5 s; qualquer retry ou falha observada aumenta o intervalo
  // rapidamente, até o teto de 12 s.
  intervaloPartidaMs: 3_500,
  intervaloMinimoMs: 2_500,
  intervaloMaximoMs: 15_000,
  sucessosParaAcelerar: 3,
  // Concorrência estrita em 1: os testes em tempo real comprovaram que qualquer
  // concorrência simultânea contra o PNCP satura o HikariPool federal e dispara falhas 500.
  concorrenciaMax: 1,
  sucessosParaAquecerConcorrencia: 10,
  sucessosParaRestaurarConcorrencia: 10,
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
    concorrenciaMax = PADRAO.concorrenciaMax,
  } = opcoes;
  // Um intervalo fornecido pelo chamador permanece fixo por padrão, deixando
  // benchmarks e diagnósticos reproduzíveis.
  const ritmoAdaptativo = opcoes.ritmoAdaptativo ?? opcoes.intervaloPartidaMs === undefined;
  let intervaloAtualMs = intervaloPartidaMs;
  let sucessosLimposSeguidos = 0;
  const concorrenciaConfigurada = Math.max(1, Math.min(2, Math.trunc(concorrenciaMax)));
  // Toda execução começa cautelosa. A segunda vaga só abre depois que a fonte
  // prova que está saudável; isso evita dobrar chamadas durante uma pane.
  let concorrenciaAtual = 1;
  let sucessosParaRestaurarConcorrencia = 0;
  let sucessosNecessariosConcorrencia = PADRAO.sucessosParaAquecerConcorrencia;

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
    aguardandoCooldown: false,
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
      esperaLimitadorMs: 0,
      intervaloFinalMs: intervaloAtualMs,
      concorrenciaMaxObservada: 0,
      concorrenciaFinal: concorrenciaAtual,
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

  // A fila serializa somente o instante de partida. As respostas podem ficar em
  // voo juntas, mas nunca criamos uma rajada contra o PNCP.
  let ultimaPartida: number | null = null;
  let filaPartidas = Promise.resolve();
  const aguardarPartida = async (): Promise<boolean> => {
    let liberar!: () => void;
    const anterior = filaPartidas;
    filaPartidas = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    await anterior;
    try {
      const espera = ultimaPartida === null ? 0 : ultimaPartida + intervaloAtualMs - agora();
      if (espera > 0) {
        if (espera >= restante()) return false;
        await dormir(espera);
        resumo.metricasApi.esperaLimitadorMs += espera;
      }
      ultimaPartida = agora();
      return true;
    } finally {
      liberar();
    }
  };

  type ResultadoProcessamento = "ok" | "definitiva" | "transitoria" | "parar";
  let requisicoesEmVoo = 0;
  const falhosNesteTick = new Set<string>();
  let aguardandoCooldown = false;

  const processarPagina = async (segmento: SegmentoPersistido): Promise<ResultadoProcessamento> => {
    try {
      const params: ParametrosConsulta = { ...segmento.query, pagina: segmento.proximaPagina };
      if (!(await aguardarPartida())) return "parar";

      let resposta;
      const inicioRequisicao = agora();
      try {
        requisicoesEmVoo++;
        resumo.metricasApi.concorrenciaMaxObservada = Math.max(
          resumo.metricasApi.concorrenciaMaxObservada,
          requisicoesEmVoo,
        );
        try {
          resposta = await buscar(segmento.endpoint, params, { orcamentoMs: restante() });
        } finally {
          requisicoesEmVoo--;
        }
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

        const falhasDaPagina = resposta.falhas
          ? resposta.falhas.timeouts +
            resposta.falhas.erros429 +
            resposta.falhas.erros5xx +
            resposta.falhas.outras
          : 0;
        if (resposta.tentativas > 1 || falhasDaPagina > 0) {
          sucessosLimposSeguidos = 0;
          sucessosParaRestaurarConcorrencia = 0;
          sucessosNecessariosConcorrencia = PADRAO.sucessosParaRestaurarConcorrencia;
          concorrenciaAtual = 1;
          resumo.metricasApi.concorrenciaFinal = concorrenciaAtual;
          if (ritmoAdaptativo) {
            intervaloAtualMs = Math.min(
              PADRAO.intervaloMaximoMs,
              Math.max(intervaloAtualMs + 1_000, Math.ceil(intervaloAtualMs * 1.5)),
            );
          }
        } else {
          sucessosLimposSeguidos++;
          sucessosParaRestaurarConcorrencia++;
          if (ritmoAdaptativo && sucessosLimposSeguidos >= PADRAO.sucessosParaAcelerar) {
            intervaloAtualMs = Math.max(PADRAO.intervaloMinimoMs, intervaloAtualMs - 250);
            sucessosLimposSeguidos = 0;
          }
          if (
            concorrenciaAtual < concorrenciaConfigurada &&
            sucessosParaRestaurarConcorrencia >= sucessosNecessariosConcorrencia
          ) {
            concorrenciaAtual = concorrenciaConfigurada;
            resumo.metricasApi.concorrenciaFinal = concorrenciaAtual;
            sucessosParaRestaurarConcorrencia = 0;
          }
        }
        resumo.metricasApi.intervaloFinalMs = intervaloAtualMs;
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
        concorrenciaAtual = 1;
        resumo.metricasApi.concorrenciaFinal = concorrenciaAtual;
        sucessosParaRestaurarConcorrencia = 0;
        sucessosNecessariosConcorrencia = PADRAO.sucessosParaRestaurarConcorrencia;
        if (ritmoAdaptativo) {
          intervaloAtualMs = Math.min(
            PADRAO.intervaloMaximoMs,
            Math.max(intervaloAtualMs + 2_000, intervaloAtualMs * 2),
          );
          resumo.metricasApi.intervaloFinalMs = intervaloAtualMs;
        }

        if (erro instanceof ErroContratoPNCP || erro instanceof RespostaInvalidaPNCP) {
          await banco.registrarFalhaSegmento(segmento.id, motivo, true);
          resumo.erros.push(`${segmento.id}: ${motivo}`);
          return "definitiva";
        }

        await banco.registrarFalhaSegmento(segmento.id, motivo, false);
        falhosNesteTick.add(segmento.id);
        resumo.erros.push(`${segmento.id}: ${motivo}`);
        // A falha pertence a este segmento. Ele entra em cooldown no banco e
        // não impede que modalidades independentes continuem neste tick.
        return "transitoria";
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
        return "ok";
      } catch (erro) {
        const motivo = erro instanceof Error ? erro.message : String(erro);
        await banco.registrarFalhaSegmento(segmento.id, motivo, false);
        resumo.erros.push(`${segmento.id}: ${motivo}`);
        return "parar";
      }
    } finally {
      await banco.liberarSegmento(segmento);
    }
  };

  while (resumo.paginasAplicadas < maxPaginasPorTick && restante() > reservaMs) {
    const vagas = Math.min(concorrenciaAtual, maxPaginasPorTick - resumo.paginasAplicadas);
    const segmentos: SegmentoPersistido[] = [];
    for (let i = 0; i < vagas; i++) {
      const segmento = await banco.proximoSegmento(jobId);
      if (!segmento) break;
      // Proteção adicional para portas sem cooldown (e durante rollout da
      // migração): a mesma falha não pode consumir todas as vagas do tick.
      if (falhosNesteTick.has(segmento.id)) {
        await banco.liberarSegmento(segmento);
        aguardandoCooldown = true;
        break;
      }
      segmentos.push(segmento);
    }

    if (segmentos.length === 0) {
      const aindaHaTrabalho =
        aguardandoCooldown ||
        (banco.haSegmentosPendentes ? await banco.haSegmentosPendentes(jobId) : false);

      if (!aindaHaTrabalho) {
        resumo.jobConcluido = true;
        break;
      }

      // Todos os segmentos estão em cooldown. Antes de devolver um tick vazio,
      // tenta esperar dentro do orçamento para retomar automaticamente.
      const cooldownMs = banco.proximoCooldown
        ? await banco.proximoCooldown(jobId)
        : null;

      if (cooldownMs !== null && cooldownMs > 0 && cooldownMs + reservaMs < restante()) {
        // O próximo segmento sai de cooldown dentro do orçamento: esperar e
        // tentar de novo em vez de devolver tick vazio.
        await dormir(cooldownMs + 500); // +500 ms de margem
        continue; // volta ao while e tenta pegar segmentos de novo
      }

      // Cooldown não cabe no orçamento: sinalizar ao frontend que é espera,
      // não falha definitiva.
      resumo.aguardandoCooldown = true;
      if (resumo.erros.length === 0) {
        resumo.erros.push("Segmentos aguardando nova tentativa após falha temporária do PNCP.");
      }
      break;
    }

    const resultados = await Promise.all(segmentos.map(processarPagina));
    if (resultados.includes("parar")) break;
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
