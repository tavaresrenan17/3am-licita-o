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
 * - falha transitória adia só aquele segmento; duas seguidas, sem página boa
 *   entre elas, encerram o tick (a fonte está fora, não é uma modalidade lenta);
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
  registrarMetricasApi?(
    jobId: string,
    metricas: MetricasApiTick,
    pipeline: MetricasPipelineTick,
    eventoId?: string,
  ): Promise<void>;
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

/**
 * Tempos acumulados das operações do worker fora da espera controlada e da API.
 * Com concorrência, operações podem se sobrepor; por isso a soma pode superar
 * a duração de parede do tick.
 */
export interface MetricasPipelineTick {
  transformacaoMs: number;
  salvarPayloadMs: number;
  mergeMs: number;
  /** Reserva/liberação de segmento, consultas de cooldown e registro de falhas. */
  administracaoDbMs: number;
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
  /**
   * A última chamada ao PNCP, antes deste tick, falhou. Quem conduz os ticks
   * sabe disso; o worker começa então em modo sonda (ver `sondarComUmaTentativa`).
   */
  fonteInstavel?: boolean;
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
  /** Ms até o próximo segmento sair do cooldown, quando o tick parou por isso. */
  proximaTentativaEmMs: number | null;
  erros: string[];
  duracaoMs: number;
  metricasApi: MetricasApiTick;
  metricasPipeline: MetricasPipelineTick;
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
  // Falhas transitórias seguidas, sem nenhuma página boa entre elas, que
  // encerram o tick. Uma falha isolada é modalidade lenta e as outras seguem;
  // duas seguidas é a fonte fora — nos logs de 21 a 23/09/2026 cada tick passava
  // por 7 ou 8 modalidades, ~76 s cada, contra um PNCP que só devolvia 504.
  falhasSeguidasParaEncerrar: 2,
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
    proximaTentativaEmMs: null,
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
    metricasPipeline: {
      transformacaoMs: 0,
      salvarPayloadMs: 0,
      mergeMs: 0,
      administracaoDbMs: 0,
    },
  };
  let operacoesAdministrativas = 0;

  const medirAdministracaoDb = async <T>(operacao: () => Promise<T>): Promise<T> => {
    const comeco = agora();
    operacoesAdministrativas++;
    try {
      return await operacao();
    } finally {
      resumo.metricasPipeline.administracaoDbMs += Math.max(0, agora() - comeco);
    }
  };

  const somarFalhas = (falhas?: FalhasTentativasPNCP) => {
    if (!falhas) return;
    resumo.metricasApi.timeouts += falhas.timeouts;
    resumo.metricasApi.erros429 += falhas.erros429;
    resumo.metricasApi.erros5xx += falhas.erros5xx;
    resumo.metricasApi.outras += falhas.outras;
  };

  const metricasPersistidas = {
    requisicoes: 0,
    sucessos: 0,
    tentativas: 0,
    timeouts: 0,
    erros429: 0,
    erros5xx: 0,
    outras: 0,
    latenciaTotalMs: 0,
    esperaLimitadorMs: 0,
    transformacaoMs: 0,
    salvarPayloadMs: 0,
    mergeMs: 0,
    administracaoDbMs: 0,
    operacoesAdministrativas: 0,
  };
  let paginasPersistidas = 0;
  type SnapshotMetricas = typeof metricasPersistidas;
  let loteMetricasPendente: {
    eventoId: string;
    api: MetricasApiTick;
    pipeline: MetricasPipelineTick;
    alvo: SnapshotMetricas;
    paginasAlvo: number;
  } | null = null;

  const snapshotAtual = (): SnapshotMetricas => ({
    requisicoes: resumo.metricasApi.requisicoes,
    sucessos: resumo.metricasApi.sucessos,
    tentativas: resumo.metricasApi.tentativas,
    timeouts: resumo.metricasApi.timeouts,
    erros429: resumo.metricasApi.erros429,
    erros5xx: resumo.metricasApi.erros5xx,
    outras: resumo.metricasApi.outras,
    latenciaTotalMs: resumo.metricasApi.latenciaTotalMs,
    esperaLimitadorMs: resumo.metricasApi.esperaLimitadorMs,
    transformacaoMs: resumo.metricasPipeline.transformacaoMs,
    salvarPayloadMs: resumo.metricasPipeline.salvarPayloadMs,
    mergeMs: resumo.metricasPipeline.mergeMs,
    administracaoDbMs: resumo.metricasPipeline.administracaoDbMs,
    operacoesAdministrativas,
  });

  const flushMetricas = async (): Promise<boolean> => {
    if (!banco.registrarMetricasApi) return false;
    if (!loteMetricasPendente) {
      const alvo = snapshotAtual();
      const api: MetricasApiTick = {
        requisicoes: alvo.requisicoes - metricasPersistidas.requisicoes,
        sucessos: alvo.sucessos - metricasPersistidas.sucessos,
        tentativas: alvo.tentativas - metricasPersistidas.tentativas,
        timeouts: alvo.timeouts - metricasPersistidas.timeouts,
        erros429: alvo.erros429 - metricasPersistidas.erros429,
        erros5xx: alvo.erros5xx - metricasPersistidas.erros5xx,
        outras: alvo.outras - metricasPersistidas.outras,
        latenciaTotalMs: alvo.latenciaTotalMs - metricasPersistidas.latenciaTotalMs,
        latenciaMaxMs: resumo.metricasApi.latenciaMaxMs,
        falhasConsecutivas: resumo.metricasApi.falhasConsecutivas,
        reiniciarFalhasConsecutivas: resumo.metricasApi.reiniciarFalhasConsecutivas,
        esperaLimitadorMs: alvo.esperaLimitadorMs - metricasPersistidas.esperaLimitadorMs,
        intervaloFinalMs: resumo.metricasApi.intervaloFinalMs,
        concorrenciaMaxObservada: resumo.metricasApi.concorrenciaMaxObservada,
        concorrenciaFinal: resumo.metricasApi.concorrenciaFinal,
      };
      const pipeline: MetricasPipelineTick = {
        transformacaoMs: alvo.transformacaoMs - metricasPersistidas.transformacaoMs,
        salvarPayloadMs: alvo.salvarPayloadMs - metricasPersistidas.salvarPayloadMs,
        mergeMs: alvo.mergeMs - metricasPersistidas.mergeMs,
        administracaoDbMs: alvo.administracaoDbMs - metricasPersistidas.administracaoDbMs,
      };
      const possuiDelta =
        api.requisicoes > 0 ||
        api.tentativas > 0 ||
        api.esperaLimitadorMs > 0 ||
        alvo.operacoesAdministrativas > metricasPersistidas.operacoesAdministrativas ||
        Object.values(pipeline).some((valor) => valor > 0);
      if (!possuiDelta) return false;
      loteMetricasPendente = {
        eventoId: globalThis.crypto.randomUUID(),
        api,
        pipeline,
        alvo,
        paginasAlvo: resumo.paginasAplicadas,
      };
    }

    const lote = loteMetricasPendente;
    await banco.registrarMetricasApi(jobId, lote.api, lote.pipeline, lote.eventoId);
    Object.assign(metricasPersistidas, lote.alvo);
    paginasPersistidas = lote.paginasAlvo;
    loteMetricasPendente = null;
    return true;
  };

  const tentarFlushMetricas = async (esgotar = false) => {
    try {
      while (await flushMetricas()) {
        if (!esgotar) break;
      }
    } catch (erro) {
      // Telemetria nunca participa do checkpoint. O mesmo evento será tentado
      // novamente no epílogo; com a migração nova, a RPC é idempotente.
      console.warn(
        "Não foi possível registrar a saúde da API do PNCP:",
        erro instanceof Error ? erro.message : erro,
      );
    }
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
  let falhasTransitoriasSeguidas = 0;
  // Modo sonda: enquanto a última chamada ao PNCP tiver falhado, cada página sai
  // com uma única tentativa. Com a fonte fora, as três tentativas de 25 s levavam
  // ~77 s por sonda sem mudar o resultado (23/09/2026). A sonda é a própria
  // página seguinte, então, se a fonte voltou, ela já grava. O timeout continua
  // o mesmo: encurtá-lo impediria de perceber uma fonte lenta mas funcionando.
  let sondarComUmaTentativa = opcoes.fonteInstavel ?? false;

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
          resposta = await buscar(
            segmento.endpoint,
            params,
            sondarComUmaTentativa
              ? { orcamentoMs: restante(), tentativasMax: 1 }
              : { orcamentoMs: restante() },
          );
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
        sondarComUmaTentativa = false;
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
          await medirAdministracaoDb(() => banco.registrarFalhaSegmento(segmento.id, motivo, true));
          resumo.erros.push(`${segmento.id}: ${motivo}`);
          return "definitiva";
        }

        await medirAdministracaoDb(() => banco.registrarFalhaSegmento(segmento.id, motivo, false));
        falhosNesteTick.add(segmento.id);
        sondarComUmaTentativa = true;
        resumo.erros.push(`${segmento.id}: ${motivo}`);
        // A falha pertence a este segmento. Ele entra em cooldown no banco e
        // não impede que modalidades independentes continuem neste tick.
        return "transitoria";
      }

      const fetchedAt = new Date(agora()).toISOString();
      const itens = resposta.envelope?.data ?? [];
      const inicioTransformacao = agora();
      const { linhas, payloads, rejeitados } =
        resposta.status === 204
          ? { linhas: [], payloads: [], rejeitados: [] }
          : mapearLote(itens, cfg, segmento.endpoint === "proposta", fetchedAt);
      resumo.metricasPipeline.transformacaoMs += Math.max(0, agora() - inicioTransformacao);

      if (rejeitados.length > 0) {
        resumo.erros.push(...rejeitados.map((r) => `${segmento.id}: ${r}`));
      }

      try {
        if (payloads.length > 0) {
          try {
            const inicioPayload = agora();
            try {
              await banco.salvarPayloads(segmento.endpoint, payloads);
            } finally {
              resumo.metricasPipeline.salvarPayloadMs += Math.max(0, agora() - inicioPayload);
            }
          } catch (erro) {
            const motivo = erro instanceof Error ? erro.message : String(erro);
            resumo.erros.push(`${segmento.id}: payload bruto não guardado — ${motivo}`);
          }
        }

        const inicioMerge = agora();
        const merge = await (async () => {
          try {
            return await banco.mergePagina({
              segmentoId: segmento.id,
              pagina: segmento.proximaPagina,
              totalPaginas: resposta.envelope?.totalPaginas ?? null,
              totalRegistros: resposta.envelope?.totalRegistros ?? null,
              linhas,
              admissao: segmento.endpoint === "atualizacao" ? "abertas" : "todas",
            });
          } finally {
            resumo.metricasPipeline.mergeMs += Math.max(0, agora() - inicioMerge);
          }
        })();

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
        await medirAdministracaoDb(() => banco.registrarFalhaSegmento(segmento.id, motivo, false));
        resumo.erros.push(`${segmento.id}: ${motivo}`);
        return "parar";
      }
    } finally {
      await medirAdministracaoDb(() => banco.liberarSegmento(segmento));
    }
  };

  while (resumo.paginasAplicadas < maxPaginasPorTick && restante() > reservaMs) {
    const vagas = Math.min(concorrenciaAtual, maxPaginasPorTick - resumo.paginasAplicadas);
    const segmentos: SegmentoPersistido[] = [];
    for (let i = 0; i < vagas; i++) {
      const segmento = await medirAdministracaoDb(() => banco.proximoSegmento(jobId));
      if (!segmento) break;
      // Proteção adicional para portas sem cooldown (e durante rollout da
      // migração): a mesma falha não pode consumir todas as vagas do tick.
      if (falhosNesteTick.has(segmento.id)) {
        await medirAdministracaoDb(() => banco.liberarSegmento(segmento));
        aguardandoCooldown = true;
        break;
      }
      segmentos.push(segmento);
    }

    if (segmentos.length === 0) {
      const aindaHaTrabalho =
        aguardandoCooldown ||
        (banco.haSegmentosPendentes
          ? await medirAdministracaoDb(() => banco.haSegmentosPendentes!(jobId))
          : false);

      if (!aindaHaTrabalho) {
        resumo.jobConcluido = true;
        break;
      }

      // Todos os segmentos estão em cooldown. Antes de devolver um tick vazio,
      // tenta esperar dentro do orçamento para retomar automaticamente.
      const cooldownMs = banco.proximoCooldown
        ? await medirAdministracaoDb(() => banco.proximoCooldown!(jobId))
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
    if (resumo.paginasAplicadas - paginasPersistidas >= 5) {
      await tentarFlushMetricas();
    }
    if (resultados.includes("parar")) break;
    for (const resultado of resultados) {
      if (resultado === "ok") falhasTransitoriasSeguidas = 0;
      else if (resultado === "transitoria") falhasTransitoriasSeguidas++;
    }
    if (falhasTransitoriasSeguidas >= PADRAO.falhasSeguidasParaEncerrar) break;
  }

  await tentarFlushMetricas(true);

  if (resumo.paginasAplicadas === 0 && !resumo.jobConcluido) {
    if (aguardandoCooldown) {
      resumo.aguardandoCooldown = true;
    } else if (banco.haSegmentosPendentes) {
      const haPendentes = await medirAdministracaoDb(() => banco.haSegmentosPendentes!(jobId));
      if (haPendentes) {
        resumo.aguardandoCooldown = true;
      }
    }
  }

  if (resumo.aguardandoCooldown && banco.proximoCooldown) {
    resumo.proximaTentativaEmMs = await medirAdministracaoDb(() => banco.proximoCooldown!(jobId));
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
