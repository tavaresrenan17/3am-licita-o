/**
 * ACESSO AO SUPABASE (somente servidor).
 *
 * Usa a service role: nenhuma dessas chamadas pode sair do servidor. As tabelas
 * têm RLS ativo e sem políticas, então a chave publicável do navegador não
 * alcança nada — o acesso da interface passa pelas server functions.
 *
 * Enquanto `supabase gen types` não for executado, `Database` está vazio; por
 * isso o cliente é usado sem genérico. Depois de gerar os tipos, remover o cast.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ConfiguracoesDTO, PatchConfiguracoesDTO } from "@/lib/dto";
import type { EndpointPNCP, ParametrosConsulta } from "./contract";
import {
  dataCalendario,
  ultimaDataFechavel,
  type CoberturaParticao,
  type SegmentoColeta,
} from "./planner";
import type {
  LicitacaoParaDocumentos,
  PortaDocumentos,
  ResultadoGravacao,
} from "./worker.documentos.server";
import type {
  EntradaMerge,
  MetricasApiTick,
  MetricasPipelineTick,
  PayloadBruto,
  PortaIngestao,
  ResultadoMerge,
  SegmentoPersistido,
} from "./worker.server";

const db = (): SupabaseClient => supabaseAdmin as unknown as SupabaseClient;

function erro(contexto: string, e: { message: string; code?: string } | null): never | void {
  if (e) throw new Error(`${contexto}: ${e.message}${e.code ? ` (${e.code})` : ""}`);
}

/* ----------------------------------------------------------- configurações */

// Mesmo contrato usado pelas telas: declarado uma vez em lib/dto.ts, que é
// código neutro e pode ser importado dos dois lados.
export type ConfiguracoesApp = ConfiguracoesDTO;

export async function obterConfiguracoes(): Promise<ConfiguracoesApp> {
  const { data, error } = await db().from("configuracoes").select("*").eq("id", true).single();
  erro("Falha ao ler configurações", error);
  const config = data as ConfiguracoesApp;
  // Compatibilidade durante o rollout da migração: versões antigas usavam []
  // como atalho para Brasil inteiro. Até o banco receber a restrição nova, a
  // aplicação converte esse legado no recorte inicial aprovado para o produto.
  return config.ufs_coleta.length > 0 ? config : { ...config, ufs_coleta: ["SP"] };
}

export type PatchConfiguracoes = PatchConfiguracoesDTO;

export async function salvarConfiguracoes(patch: PatchConfiguracoes): Promise<ConfiguracoesApp> {
  // Chave com `undefined` não pode virar coluna no UPDATE: seria gravar nulo
  // onde o usuário apenas não mexeu.
  const campos = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));

  const { data, error } = await db()
    .from("configuracoes")
    .update({ ...campos, atualizado_em: new Date().toISOString() })
    .eq("id", true)
    .select("*")
    .single();
  erro("Falha ao salvar configurações", error);
  return data as ConfiguracoesApp;
}

/* -------------------------------------------------------------- sincronização */

export interface JobSincronizacao {
  id: string;
  status: string;
  /** 'descoberta' busca oportunidades novas; 'incremental' busca mudanças. */
  tipo: "descoberta" | "incremental";
  /** Recorte de tempo fixado antes do primeiro GET; nulo na descoberta. */
  cutoff: string | null;
  escopo: unknown;
  descricao_escopo: string;
  segmentos_planejados: number;
  segmentos_concluidos: number;
  paginas_consultadas: number;
  registros_consultados: number;
  total_novos: number;
  total_atualizados: number;
  total_ignorados: number;
  /** Recusados pela política de admissão: escolha nossa, não "não mudou". */
  total_nao_admitidos: number;
  total_documentos: number;
  api_requisicoes_total: number;
  api_requisicoes_sucesso: number;
  api_tentativas_total: number;
  api_timeouts: number;
  api_erros_429: number;
  api_erros_5xx: number;
  api_falhas_outros: number;
  api_latencia_total_ms: number;
  api_latencia_max_ms: number;
  api_falhas_consecutivas: number;
  api_ultima_resposta_em: string | null;
  bootstrap_started_at: string;
  fonte_observada_em: string | null;
  mensagem_erro: string | null;
  inicio_em: string;
  finalizado_em: string | null;
}

/** Job em andamento, se houver. O índice único garante no máximo um. */
export async function jobEmAndamento(): Promise<JobSincronizacao | null> {
  const { data, error } = await db()
    .from("sincronizacoes")
    .select("*")
    .eq("status", "em_andamento")
    .maybeSingle();
  erro("Falha ao consultar sincronização em andamento", error);
  return (data as JobSincronizacao) ?? null;
}

export async function obterSincronizacao(jobId: string): Promise<JobSincronizacao | null> {
  const { data, error } = await db()
    .from("sincronizacoes")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  erro("Falha ao ler sincronização", error);
  return (data as JobSincronizacao) ?? null;
}

export async function listarSincronizacoes(limite = 20): Promise<JobSincronizacao[]> {
  const { data, error } = await db()
    .from("sincronizacoes")
    .select("*")
    .order("inicio_em", { ascending: false })
    .limit(limite);
  erro("Falha ao listar sincronizações", error);
  return (data ?? []) as JobSincronizacao[];
}

/**
 * Cria o job e seus segmentos. `bootstrap_started_at` nasce ANTES do primeiro
 * GET: é dele que o incremental da Fase 3 vai partir, nunca do fim da carga.
 */
export async function criarSincronizacao(
  escopo: unknown,
  descricao: string,
  segmentos: SegmentoColeta[],
  opcoes: { tipo?: "descoberta" | "incremental"; cutoff?: string | null } = {},
): Promise<JobSincronizacao> {
  const agora = new Date().toISOString();

  const { data, error } = await db()
    .from("sincronizacoes")
    .insert({
      status: "em_andamento",
      tipo: opcoes.tipo ?? "descoberta",
      escopo: escopo as Record<string, unknown>,
      descricao_escopo: descricao,
      segmentos_planejados: segmentos.length,
      bootstrap_started_at: agora,
      // Recorte de tempo fixado ANTES do primeiro GET. O fim do job não é
      // "sincronizado até agora": a fonte não deu snapshot (arquivo 03 §4).
      cutoff: opcoes.cutoff ?? null,
      inicio_em: agora,
    })
    .select("*")
    .single();

  if (error?.code === "23505") {
    throw new Error("Já existe uma sincronização em andamento.");
  }
  erro("Falha ao criar sincronização", error);

  const job = data as JobSincronizacao;

  const linhas = segmentos.map((s) => {
    const { pagina: _pagina, ...query } = s.params;
    return {
      sincronizacao_id: job.id,
      endpoint: s.endpoint,
      assinatura: s.assinatura,
      descricao: s.descricao,
      query,
      proxima_pagina: 1,
      status: "pendente",
      prioridade: s.prioridade ?? 100,
    };
  });

  const { error: erroSegmentos } = await db().from("ingestao_segmentos").insert(linhas);
  erro("Falha ao criar segmentos", erroSegmentos);

  return job;
}

/* ------------------------------------------------------------ porta do worker */

interface LinhaSegmento {
  id: string;
  posse_token: string;
  endpoint: EndpointPNCP;
  query: Omit<ParametrosConsulta, "pagina">;
  proxima_pagina: number;
  total_paginas_observado: number | null;
}

export function portaIngestao(): PortaIngestao {
  return {
    async proximoSegmento(jobId: string): Promise<SegmentoPersistido | null> {
      // RPC, e não select: a posse precisa sair na mesma transação da escolha
      // (`for update skip locked`), senão dois ticks pegam o mesmo segmento e
      // duplicam requisições — caro, com o limitador de rajada do PNCP.
      const { data, error } = await db().rpc("pncp_reservar_segmento", {
        p_sincronizacao_id: jobId,
      });
      erro("Falha ao reservar próximo segmento", error);

      const linha = ((data ?? []) as LinhaSegmento[])[0];
      if (!linha) return null;

      return {
        id: linha.id,
        posseToken: linha.posse_token,
        endpoint: linha.endpoint,
        query: linha.query,
        proximaPagina: linha.proxima_pagina,
        totalPaginasObservado: linha.total_paginas_observado,
      };
    },

    async liberarSegmento(segmento: SegmentoPersistido): Promise<void> {
      if (!segmento.posseToken) return;
      const { error } = await db().rpc("pncp_liberar_segmento", {
        p_id: segmento.id,
        p_token: segmento.posseToken,
      });
      erro("Falha ao liberar segmento", error);
    },

    async mergePagina(entrada: EntradaMerge): Promise<ResultadoMerge> {
      // Uma transação no banco: mescla, histórico, checkpoint e contadores.
      const { data, error } = await db().rpc("pncp_merge_page", {
        p_segmento_id: entrada.segmentoId,
        p_pagina: entrada.pagina,
        p_total_paginas: entrada.totalPaginas,
        p_total_registros: entrada.totalRegistros,
        p_rows: entrada.linhas,
        p_admissao: entrada.admissao,
      });
      erro("Falha ao gravar página", error);

      const r = data as {
        aplicado: boolean;
        recebidos: number;
        novos: number;
        atualizados: number;
        ignorados: number;
        nao_admitidos: number;
        proxima_pagina: number;
        segmento_concluido: boolean;
      };

      return {
        aplicado: r.aplicado,
        recebidos: r.recebidos,
        novos: r.novos,
        atualizados: r.atualizados,
        ignorados: r.ignorados,
        naoAdmitidos: r.nao_admitidos ?? 0,
        proximaPagina: r.proxima_pagina,
        segmentoConcluido: r.segmento_concluido,
      };
    },

    async salvarPayloads(endpoint: EndpointPNCP, itens: PayloadBruto[]): Promise<void> {
      const { error } = await db().rpc("pncp_salvar_payloads", {
        p_endpoint: endpoint,
        p_itens: itens.map((i) => ({
          numero_controle_pncp: i.numeroControlePncp,
          hash: i.hash,
          payload: i.payload,
        })),
      });
      erro("Falha ao guardar payload bruto", error);
    },

    async registrarFalhaSegmento(segmentoId, motivo, definitiva): Promise<void> {
      const { data } = await db()
        .from("ingestao_segmentos")
        .select("tentativas")
        .eq("id", segmentoId)
        .maybeSingle();
      const tentativas = ((data as { tentativas?: number } | null)?.tentativas ?? 0) + 1;
      // Cooldown progressivo: primeira falha 15 s, segunda 30 s, depois
      // exponencial (60 s, 2 min, 4 min) até o teto de 15 min. O cooldown
      // anterior de 60 s para a primeira falha causava ciclo morto no
      // frontend, que desistia antes do segmento voltar à fila.
      const esperaMs =
        tentativas <= 2
          ? 15_000 * tentativas // 15 s, 30 s
          : Math.min(15 * 60_000, 60_000 * 2 ** Math.min(tentativas - 3, 4)); // 60 s, 2 min, ...

      const { error } = await db()
        .from("ingestao_segmentos")
        .update({
          // Falha definitiva encerra o segmento; transitória volta para a fila
          // com o checkpoint intacto.
          status: definitiva ? "falhou" : "pendente",
          tentativas,
          ultimo_erro: motivo.slice(0, 500),
          proxima_tentativa_em: definitiva ? null : new Date(Date.now() + esperaMs).toISOString(),
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", segmentoId);
      erro("Falha ao registrar erro do segmento", error);
    },

    async haSegmentosPendentes(jobId: string): Promise<boolean> {
      const { count, error } = await db()
        .from("ingestao_segmentos")
        .select("id", { count: "exact", head: true })
        .eq("sincronizacao_id", jobId)
        .in("status", ["pendente", "executando"]);
      erro("Falha ao verificar segmentos pendentes", error);
      return (count ?? 0) > 0;
    },

    async registrarMetricasApi(
      jobId: string,
      metricas: MetricasApiTick,
      pipeline: MetricasPipelineTick,
      eventoId?: string,
    ): Promise<void> {
      const parametrosApi = {
        p_sincronizacao_id: jobId,
        p_requisicoes: metricas.requisicoes,
        p_sucessos: metricas.sucessos,
        p_tentativas: metricas.tentativas,
        p_timeouts: metricas.timeouts,
        p_erros_429: metricas.erros429,
        p_erros_5xx: metricas.erros5xx,
        p_falhas_outros: metricas.outras,
        p_latencia_total_ms: metricas.latenciaTotalMs,
        p_latencia_max_ms: metricas.latenciaMaxMs,
        p_falhas_consecutivas: metricas.falhasConsecutivas,
        p_reiniciar_consecutivas: metricas.reiniciarFalhasConsecutivas,
      };
      const { error } = await db().rpc("pncp_registrar_metricas_pipeline", {
        ...parametrosApi,
        p_evento_id: eventoId ?? globalThis.crypto.randomUUID(),
        p_transformacao_ms: pipeline.transformacaoMs,
        p_salvar_payload_ms: pipeline.salvarPayloadMs,
        p_merge_ms: pipeline.mergeMs,
        p_administracao_db_ms: pipeline.administracaoDbMs,
      });
      // Compatibilidade durante o rollout: a coleta continua funcionando até a
      // migração nova ser aplicada. Nesse período, preserva as métricas antigas.
      if (error?.code === "PGRST202" || error?.code === "42883") {
        const { error: errorLegado } = await db().rpc("pncp_registrar_metricas_api", parametrosApi);
        if (errorLegado?.code === "PGRST202" || errorLegado?.code === "42883") return;
        erro("Falha ao registrar saúde da API do PNCP", errorLegado);
        return;
      }
      erro("Falha ao registrar saúde da API do PNCP", error);
    },

    async finalizarJob(jobId, status, mensagem): Promise<void> {
      const { error } = await db()
        .from("sincronizacoes")
        .update({
          status,
          mensagem_erro: mensagem ?? null,
          finalizado_em: new Date().toISOString(),
        })
        .eq("id", jobId);
      erro("Falha ao finalizar sincronização", error);
    },

    async proximoCooldown(jobId: string): Promise<number | null> {
      // Encontra o segmento pendente cujo cooldown termina mais cedo.
      const { data, error } = await db()
        .from("ingestao_segmentos")
        .select("proxima_tentativa_em")
        .eq("sincronizacao_id", jobId)
        .eq("status", "pendente")
        .not("proxima_tentativa_em", "is", null)
        .order("proxima_tentativa_em", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) return null; // Não propagar: telemetria não deve travar o tick.

      const proximo = (data as { proxima_tentativa_em?: string } | null)?.proxima_tentativa_em;
      if (!proximo) return null;

      const restanteMs = Date.parse(proximo) - Date.now();
      return restanteMs > 0 ? restanteMs : 0;
    },
  };
}

/* ------------------------------------------- cobertura incremental (F3) --- */

/** AAAAMMDD, como o segmento guardou, → AAAA-MM-DD da aritmética de calendário. */
const paraIso = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

/** Fronteira já alcançada em cada partição (UF × modalidade). */
export async function listarCoberturaIncremental(): Promise<CoberturaParticao[]> {
  const { data, error } = await db()
    .from("ingestao_cobertura")
    .select("uf, modalidade_id, ultima_data_fechada")
    .eq("endpoint", "atualizacao");
  erro("Falha ao ler cobertura incremental", error);

  return (
    (data ?? []) as { uf: string; modalidade_id: number; ultima_data_fechada: string | null }[]
  ).map((c) => ({
    uf: c.uf ?? "",
    modalidadeId: c.modalidade_id,
    ultimaDataFechada: c.ultima_data_fechada,
  }));
}

/**
 * De onde o incremental parte numa partição que nunca foi coberta.
 *
 * É a data de calendário do `bootstrap_started_at` da carga inicial mais
 * antiga, e não o fim dela: mudanças ocorridas DURANTE a carga precisam
 * continuar recuperáveis (arquivo 03 §3). Sem nenhuma carga registrada, não há
 * catálogo para atualizar e quem chama decide o que fazer.
 */
export async function inicioPadraoIncremental(): Promise<string | null> {
  const { data, error } = await db()
    .from("sincronizacoes")
    .select("bootstrap_started_at")
    .eq("tipo", "descoberta")
    .order("bootstrap_started_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  erro("Falha ao ler início da carga inicial", error);

  const inicio = (data as { bootstrap_started_at?: string } | null)?.bootstrap_started_at;
  return inicio ? dataCalendario(new Date(inicio)) : null;
}

interface LinhaCobertura {
  uf: string;
  modalidade_id: number;
  ultima_data_fechada: string | null;
  dia_corrente_provisorio: string;
  consultado_em: string;
}

/**
 * Avança a fronteira das partições que este ciclo percorreu inteiras.
 *
 * Duas regras do arquivo 03 §4 vivem aqui:
 * - uma partição só avança quando TODOS os seus segmentos concluíram; se uma
 *   janela ficou pendente, a fronteira não pode passar por cima dela;
 * - o dia corrente nunca fecha, e quem decide isso é `ultimaDataFechavel`, no
 *   planejador — esta função só agrupa e grava.
 */
export async function avancarCobertura(jobId: string, agora: Date = new Date()): Promise<number> {
  const { data, error } = await db()
    .from("ingestao_segmentos")
    .select("query, status")
    .eq("sincronizacao_id", jobId)
    .eq("endpoint", "atualizacao");
  erro("Falha ao ler segmentos para avançar cobertura", error);

  const hoje = dataCalendario(agora);
  const agrupado = new Map<
    string,
    { uf: string; modalidade: number; fechada: string | null; completa: boolean }
  >();

  for (const linha of (data ?? []) as {
    query: Record<string, unknown>;
    status: string;
  }[]) {
    const uf = (linha.query["uf"] as string | undefined) ?? "";
    const modalidade = Number(linha.query["codigoModalidadeContratacao"]);
    const de = String(linha.query["dataInicial"] ?? "");
    const ate = String(linha.query["dataFinal"] ?? "");
    if (!Number.isInteger(modalidade) || de.length !== 8 || ate.length !== 8) continue;

    const chave = `${uf}|${modalidade}`;
    const atual = agrupado.get(chave) ?? { uf, modalidade, fechada: null, completa: true };

    if (linha.status !== "concluido") {
      atual.completa = false;
    } else {
      const fechavel = ultimaDataFechavel(paraIso(de), paraIso(ate), hoje);
      if (fechavel && (!atual.fechada || fechavel > atual.fechada)) atual.fechada = fechavel;
    }

    agrupado.set(chave, atual);
  }

  const linhas: LinhaCobertura[] = [...agrupado.values()]
    .filter((p) => p.completa)
    .map((p) => ({
      uf: p.uf,
      modalidade_id: p.modalidade,
      ultima_data_fechada: p.fechada,
      dia_corrente_provisorio: hoje,
      consultado_em: agora.toISOString(),
    }));

  if (linhas.length === 0) return 0;

  const { data: gravados, error: erroGravar } = await db().rpc("pncp_gravar_cobertura", {
    p_linhas: linhas,
  });
  erro("Falha ao gravar cobertura incremental", erroGravar);
  return Number(gravados ?? 0);
}

/** Diagnóstico da cobertura para a tela: de quando é o que temos. */
export async function diagnosticoCobertura() {
  const { data, error } = await db().rpc("cobertura_incremental", {});
  erro("Falha ao ler diagnóstico de cobertura", error);
  return data as Record<string, unknown>;
}

/* -------------------------------------------- porta da fila de documentos */

interface LinhaReserva {
  licitacao_id: string;
  cnpj_orgao: string;
  ano_compra: number;
  sequencial_compra: number;
  objeto: string | null;
  modalidade_nome: string | null;
  categoria: string | null;
  valor_total_estimado: number | string | null;
}

export function portaDocumentos(): PortaDocumentos {
  return {
    async reservar(limite: number): Promise<LicitacaoParaDocumentos[]> {
      // A RPC entrega e marca 'coletando' na mesma transação: dois ticks
      // simultâneos não coletam a mesma licitação.
      const { data, error } = await db().rpc("pncp_reservar_licitacoes_documentos", {
        p_limite: limite,
      });
      erro("Falha ao reservar licitações para documentos", error);

      return ((data ?? []) as LinhaReserva[]).map((l) => ({
        licitacaoId: l.licitacao_id,
        cnpj: l.cnpj_orgao,
        ano: l.ano_compra,
        sequencial: l.sequencial_compra,
        objeto: l.objeto ?? "",
        modalidadeNome: l.modalidade_nome,
        categoria: l.categoria ?? "Outros",
        // numeric do Postgres chega como texto no PostgREST; Number(null) seria
        // 0, e zero aqui significaria "de graça" em vez de "não divulgado".
        valorEstimado:
          l.valor_total_estimado === null || l.valor_total_estimado === ""
            ? null
            : Number(l.valor_total_estimado),
      }));
    },

    async gravar(licitacaoId, documentos, score): Promise<ResultadoGravacao> {
      const { data, error } = await db().rpc("pncp_gravar_documentos", {
        p_licitacao_id: licitacaoId,
        p_documentos: documentos,
        p_score: score,
      });
      erro("Falha ao gravar documentos", error);

      const r = (data ?? {}) as { gravados?: number; removidos?: number; ativos?: number };
      return { gravados: r.gravados ?? 0, removidos: r.removidos ?? 0, ativos: r.ativos ?? 0 };
    },

    async registrarFalha(licitacaoId, motivo, definitiva): Promise<void> {
      const { error } = await db().rpc("pncp_falha_documentos", {
        p_licitacao_id: licitacaoId,
        p_erro: motivo,
        p_definitiva: definitiva,
      });
      erro("Falha ao registrar erro de documentos", error);
    },

    async liberar(licitacaoIds: string[]): Promise<void> {
      if (licitacaoIds.length === 0) return;
      const { error } = await db()
        .from("documentos_estado")
        .update({ estado: "pendente", atualizado_em: new Date().toISOString() })
        .in("licitacao_id", licitacaoIds)
        // Só devolve o que este tick reservou: uma coleta que terminou entre a
        // reserva e a liberação não pode ser rebaixada de volta para 'pendente'.
        .eq("estado", "coletando");
      erro("Falha ao devolver licitações à fila de documentos", error);
    },
  };
}

/** Cobertura da coleta de documentos, para a tela de sincronização. */
export async function coberturaDocumentos() {
  const { data, error } = await db().rpc("documentos_cobertura", {});
  erro("Falha ao calcular cobertura de documentos", error);
  return data as Record<string, unknown>;
}

/** Marca um job como parcial quando o usuário interrompe ou a aba fecha. */
export async function marcarJobParcial(jobId: string, motivo: string): Promise<void> {
  const { error } = await db()
    .from("sincronizacoes")
    .update({ status: "parcial", mensagem_erro: motivo, finalizado_em: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "em_andamento");
  erro("Falha ao marcar sincronização como parcial", error);
}

export interface ProgressoSegmentos {
  planejados: number;
  concluidos: number;
  pendentes: number;
  falhados: number;
  paginasAplicadas: number;
  paginasEstimadas: number | null;
}

export async function progressoSegmentos(jobId: string): Promise<ProgressoSegmentos> {
  const { data, error } = await db()
    .from("ingestao_segmentos")
    .select("status, paginas_aplicadas, total_paginas_observado")
    .eq("sincronizacao_id", jobId);
  erro("Falha ao ler progresso dos segmentos", error);

  const linhas = (data ?? []) as {
    status: string;
    paginas_aplicadas: number;
    total_paginas_observado: number | null;
  }[];

  const paginasEstimadas = linhas.every((l) => l.total_paginas_observado === null)
    ? null
    : linhas.reduce((s, l) => s + (l.total_paginas_observado ?? l.paginas_aplicadas), 0);

  return {
    planejados: linhas.length,
    concluidos: linhas.filter((l) => l.status === "concluido").length,
    pendentes: linhas.filter((l) => l.status === "pendente" || l.status === "executando").length,
    falhados: linhas.filter((l) => l.status === "falhou").length,
    paginasAplicadas: linhas.reduce((s, l) => s + l.paginas_aplicadas, 0),
    paginasEstimadas,
  };
}

/* ------------------------------------------------------------ consultas da UI */

export interface ConsultaLicitacoesParams {
  filtros: Record<string, unknown>;
  ordenarPor: string;
  direcao: "asc" | "desc";
  limite: number;
  deslocamento: number;
  scoreMinimo: number;
}

export async function buscarLicitacoes(p: ConsultaLicitacoesParams) {
  const { data, error } = await db().rpc("buscar_licitacoes", {
    p_filtros: p.filtros,
    p_ordenar: p.ordenarPor,
    p_direcao: p.direcao,
    p_limite: p.limite,
    p_deslocamento: p.deslocamento,
    p_score_minimo: p.scoreMinimo,
  });
  erro("Falha ao consultar licitações", error);
  return data as { itens: Record<string, unknown>[]; total: number; consultado_em: string };
}

export async function metricasDashboard(scoreMinimo: number) {
  const { data, error } = await db().rpc("metricas_dashboard", { p_score_minimo: scoreMinimo });
  erro("Falha ao calcular métricas", error);
  return data as Record<string, unknown>;
}

export async function opcoesFiltros() {
  const { data, error } = await db().rpc("opcoes_filtros", {});
  erro("Falha ao listar opções de filtro", error);
  return data as Record<string, string[]>;
}

export async function listarModalidades() {
  const { data, error } = await db()
    .from("modalidades")
    .select("id, nome, ativo")
    .order("id", { ascending: true });
  erro("Falha ao listar modalidades", error);
  return (data ?? []) as { id: number; nome: string; ativo: boolean }[];
}

export async function obterLicitacao(id: string) {
  const [licitacao, documentos, historico, estado] = await Promise.all([
    // `aberta` e `situacao_temporal` são colunas computadas: quem decide é o
    // banco, a mesma função que os filtros usam. A tela não recalcula (D02).
    db().from("licitacoes").select("*, aberta, situacao_temporal").eq("id", id).maybeSingle(),
    db()
      .from("documentos_licitacao")
      .select("*")
      .eq("licitacao_id", id)
      .order("tipo_documento", { ascending: true })
      .order("sequencial_documento", { ascending: true }),
    db()
      .from("licitacoes_historico")
      .select("*")
      .eq("licitacao_id", id)
      .order("em", { ascending: false }),
    db()
      .from("documentos_estado")
      .select("estado, atualizado_em, erro")
      .eq("licitacao_id", id)
      .maybeSingle(),
  ]);

  erro("Falha ao ler licitação", licitacao.error);
  if (!licitacao.data) return null;

  const cobertura = (estado.data ?? null) as {
    estado: string;
    atualizado_em: string;
    erro: string | null;
  } | null;

  return {
    licitacao: licitacao.data as Record<string, unknown>,
    documentos: (documentos.data ?? []) as Record<string, unknown>[],
    historico: (historico.data ?? []) as Record<string, unknown>[],
    // "Sem documento" e "ainda não coletado" são coisas diferentes: quem
    // responde é o estado da coleta, não a contagem de linhas. Uma licitação
    // coletada que não tem anexo nenhum no PNCP fica 'completo' com zero
    // documentos, e a tela não pode chamar isso de pendente.
    documentosEstado: cobertura?.estado ?? "pendente",
    documentosErro: cobertura?.erro ?? null,
    documentosColetadoEm: cobertura?.estado === "completo" ? cobertura.atualizado_em : null,
    documentosPendentes: (cobertura?.estado ?? "pendente") !== "completo",
  };
}

export async function atualizarLicitacaoInterna(args: {
  id: string;
  statusInterno?: string | null;
  prioridade?: boolean | null;
  observacoes?: string | null;
  historico?: string | null;
}) {
  const { data, error } = await db().rpc("atualizar_licitacao_interna", {
    p_id: args.id,
    p_status_interno: args.statusInterno ?? null,
    p_prioridade: args.prioridade ?? null,
    p_observacoes: args.observacoes ?? null,
    p_historico: args.historico ?? null,
  });
  erro("Falha ao atualizar licitação", error);
  return data as Record<string, unknown>;
}

/**
 * Busca com reordenação semântica, quando a flag do banco autoriza.
 *
 * A ADR-001 manda o lexical continuar sendo o caminho de produção, então a
 * primeira coisa que esta função faz é ler `configuracao_busca.hibrido_ativo`.
 * Com a flag desligada — que é o padrão — ela delega para `buscarLicitacoes` e
 * o comportamento é byte a byte o de antes, sem gastar uma chamada ao provedor
 * de embedding que o SQL ignoraria de qualquer forma.
 *
 * Qualquer falha do provedor ou da RPC híbrida cai para o lexical: é o caminho
 * de rollback que a ADR exige, e ele acontece sozinho.
 */
export async function buscarLicitacoesComSemantica(p: ConsultaLicitacoesParams) {
  const { data: cfgBusca } = await db()
    .from("configuracao_busca")
    .select("hibrido_ativo")
    .eq("id", 1)
    .maybeSingle();

  if (!cfgBusca?.hibrido_ativo) {
    const lexical = await buscarLicitacoes(p);
    return { ...lexical, modo: "lexical" as const, degradou: false };
  }

  const { buscarComSemantica } = await import("../busca/hibrida.server");

  const comuns = (args: Record<string, unknown>) => ({
    p_filtros: args["p_filtros"],
    p_direcao: p.direcao,
    p_limite: args["p_limite"],
    p_deslocamento: args["p_deslocamento"],
    p_score_minimo: p.scoreMinimo,
  });

  const saida = await buscarComSemantica({
    filtros: p.filtros,
    limite: p.limite,
    deslocamento: p.deslocamento,
    rpc: {
      async hibrida(args) {
        // `p_ordenar` fixo em "relevancia" é intencional, não descuido: num modo
        // ranqueado por RRF, ordenar por data ou valor jogaria fora o ranking
        // que é a razão de existir do híbrido. A consequência conhecida é que a
        // ordenação escolhida na tela fica visualmente ativa sem efeito enquanto
        // a flag estiver ligada — dívida registrada, não bug a corrigir aqui.
        const { data, error } = await db().rpc("buscar_licitacoes_hibrida", {
          ...comuns(args),
          p_ordenar: "relevancia",
          p_embedding: args["p_embedding"],
        });
        if (error) throw new Error(error.message);
        return data;
      },
      async lexical(args) {
        const { data, error } = await db().rpc("buscar_licitacoes", {
          ...comuns(args),
          p_ordenar: p.ordenarPor,
        });
        if (error) throw new Error(error.message);
        return data;
      },
    },
  });

  // `consultado_em` vem do banco sempre que a resposta passou pela
  // `buscar_licitacoes` — inclusive quando quem respondeu foi o ramo lexical
  // DENTRO da função híbrida, que repassa o objeto dela inteiro. Só o ramo
  // híbrido de verdade não tem o campo; aí, e só aí, o relógio local entra.
  return {
    itens: saida.itens as Record<string, unknown>[],
    total: saida.total,
    consultado_em: saida.consultadoEm ?? new Date().toISOString(),
    modo: saida.modo,
    degradou: saida.degradou,
  };
}
