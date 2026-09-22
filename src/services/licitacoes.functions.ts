/**
 * SERVER FUNCTIONS — a única porta entre as telas e o banco.
 *
 * Este arquivo vai para o bundle do cliente, então nada de servidor pode ser
 * importado no topo: `supabaseAdmin` e o worker entram por `await import()`
 * dentro dos handlers (ver aviso em integrations/supabase/client.server.ts).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type {
  AnaliseLicitacaoDTO,
  CoberturaDocumentosDTO,
  CoberturaIncrementalDTO,
  DetalheDTO,
  LicitacaoDTO,
  MetricasDTO,
  ProgressoSyncDTO,
  ResultadoBuscaDTO,
  ResumoColetaDocumentosDTO,
  SincronizacaoDTO,
} from "@/lib/dto";
import type { ItemLicitacao, StatusInterno } from "@/lib/types";

/* ------------------------------------------------------------- validação --- */

const filtrosSchema = z
  .object({
    palavra_chave: z.string(),
    uf: z.string(),
    municipio: z.string(),
    orgao: z.string(),
    modalidade: z.string(),
    categoria: z.string(),
    status_interno: z.string(),
    prioridade: z.string(),
    valor_min: z.string(),
    valor_max: z.string(),
    publicacao_de: z.string(),
    publicacao_ate: z.string(),
    criadas_de: z.string(),
    limite_de: z.string(),
    limite_ate: z.string(),
    com_edital: z.boolean(),
    com_projeto: z.boolean(),
    com_orcamento: z.boolean(),
    nao_analisadas: z.boolean(),
    recomendadas: z.boolean(),
    apenas_abertas: z.boolean(),
  })
  .partial();

const consultaSchema = z.object({
  filtros: filtrosSchema.default({}),
  ordenarPor: z
    .enum([
      "data_encerramento_proposta",
      "valor_total_estimado",
      "data_publicacao",
      "score_aderencia",
    ])
    .default("data_encerramento_proposta"),
  direcao: z.enum(["asc", "desc"]).default("asc"),
  pagina: z.number().int().min(1).default(1),
  itensPorPagina: z.number().int().min(1).max(200).default(25),
});

const escopoSchema = z.object({
  ufs: z.array(z.string().length(2)).min(1).max(27).default(["SP"]),
  modalidades: z.array(z.number().int().positive()).max(19).default([]),
  horizonteDias: z.number().int().min(1).max(365).default(30),
  emEtapas: z.boolean().default(false),
  etapasHorizonteDias: z.array(z.number().int().min(1).max(365)).optional(),
});

const configSchema = z
  .object({
    ufs_coleta: z.array(z.string().length(2)).min(1).max(27),
    modalidades_coleta: z.array(z.number().int().positive()).max(19),
    horizonte_dias: z.number().int().min(1).max(365),
    palavras_chave: z.array(z.string()),
    score_peso_palavras: z.number().int().min(0).max(100),
    score_peso_documentos: z.number().int().min(0).max(100),
    score_peso_valor: z.number().int().min(0).max(100),
    score_minimo_recomendado: z.number().int().min(0).max(100),
    itens_por_pagina: z.number().int().min(10).max(200),
    colunas_visiveis: z.array(z.string()),
  })
  .partial();

/* ------------------------------------------------------------ adaptador --- */

type Linha = Record<string, unknown>;

const s = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const n = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function paraDTO(l: Linha): LicitacaoDTO {
  return {
    id: String(l["id"]),
    pncp_id: String(l["numero_controle_pncp"]),
    orgao: String(l["orgao"] ?? ""),
    cnpj_orgao: String(l["cnpj_orgao"] ?? ""),
    unidade_nome: s(l["unidade_nome"]),
    municipio: s(l["municipio"]),
    uf: s(l["uf"]),
    objeto: String(l["objeto"] ?? ""),
    valor_estimado: n(l["valor_total_estimado"]),
    data_publicacao: s(l["data_publicacao"]),
    data_abertura_proposta: s(l["data_abertura_proposta"]),
    data_limite_proposta: s(l["data_encerramento_proposta"]),
    modalidade: s(l["modalidade_nome"]),
    modalidade_id: n(l["modalidade_id"]),
    status_pncp: s(l["situacao_nome"]),
    situacao_compra_id: n(l["situacao_compra_id"]),
    aberta: Boolean(l["aberta"]),
    situacao_temporal: (l["situacao_temporal"] ??
      "indeterminada") as LicitacaoDTO["situacao_temporal"],
    categoria: String(l["categoria"] ?? "Outros"),
    score_aderencia: Number(l["score_aderencia"] ?? 0),
    status_interno: (l["status_interno"] ?? "nova") as StatusInterno,
    observacoes: String(l["observacoes"] ?? ""),
    prioridade: Boolean(l["prioridade"]),
    documentos_total: Number(l["documentos_total"] ?? 0),
    documentos_estado: (l["documentos_estado"] ?? "pendente") as LicitacaoDTO["documentos_estado"],
    url_pncp: s(l["url_pncp"]),
    link_sistema_origem: s(l["link_sistema_origem"]),
    // Só a busca híbrida preenche estes dois; no lexical eles não vêm.
    trecho: s(l["trecho"]),
    origem_semantica: Boolean(l["origem_semantica"]),
    informacao_complementar: s(l["informacao_complementar"]),
    processo: s(l["processo"]),
    srp: typeof l["srp"] === "boolean" ? (l["srp"] as boolean) : null,
    data_atualizacao_global: s(l["data_atualizacao_global"]),
    synced_at: String(l["synced_at"] ?? ""),
    updated_at: String(l["updated_at"] ?? ""),
  };
}

/* ---------------------------------------------------- cache de módulos ----- */
let _repoPromise: Promise<typeof import("./pncp/repositorio.server")> | null = null;
const getRepo = () => (_repoPromise ??= import("./pncp/repositorio.server"));

let _workerPromise: Promise<typeof import("./pncp/worker.server")> | null = null;
const getWorker = () => (_workerPromise ??= import("./pncp/worker.server"));

let _plannerPromise: Promise<typeof import("./pncp/planner")> | null = null;
const getPlanner = () => (_plannerPromise ??= import("./pncp/planner"));

let _workerDocsPromise: Promise<typeof import("./pncp/worker.documentos.server")> | null = null;
const getWorkerDocumentos = () =>
  (_workerDocsPromise ??= import("./pncp/worker.documentos.server"));

/* ------------------------------------------------------------- consultas --- */

export const buscarLicitacoesFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => consultaSchema.parse(d))
  .handler(async ({ data }): Promise<ResultadoBuscaDTO> => {
    const repo = await getRepo();
    const cfg = await repo.obterConfiguracoes();

    const resultado = await repo.buscarLicitacoesComSemantica({
      // Invariante do catálogo operacional. Mesmo que um cliente antigo envie
      // `false` ou omita o campo, a API nunca devolve licitação encerrada ou
      // sem data limite. `licitacao_aberta` no banco também exige abertura e
      // encerramento preenchidos, situação ativa e prazo ainda vigente.
      filtros: { ...data.filtros, apenas_abertas: true },
      ordenarPor: data.ordenarPor,
      direcao: data.direcao,
      limite: data.itensPorPagina,
      deslocamento: (data.pagina - 1) * data.itensPorPagina,
      scoreMinimo: cfg.score_minimo_recomendado,
    });

    return {
      itens: resultado.itens.map(paraDTO),
      total: resultado.total,
      pagina: data.pagina,
      totalPaginas: Math.max(1, Math.ceil(resultado.total / data.itensPorPagina)),
      consultadoEm: resultado.consultado_em,
      modo: resultado.modo,
      degradou: resultado.degradou,
    };
  });

export const obterLicitacaoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<DetalheDTO | null> => {
    const repo = await getRepo();
    const detalhe = await repo.obterLicitacao(data.id);
    if (!detalhe) return null;

    return {
      licitacao: paraDTO({
        ...detalhe.licitacao,
        // Só documento vigente conta: um anexo retirado na fonte não é material
        // disponível para a equipe.
        documentos_total: detalhe.documentos.filter((d) => d["ativo"] !== false).length,
        documentos_estado: detalhe.documentosEstado,
      }),
      documentos: detalhe.documentos.map((d) => ({
        id: String(d["id"]),
        tipo_documento: d["tipo_documento"] as DetalheDTO["documentos"][number]["tipo_documento"],
        tipo_documento_pncp: s(d["tipo_documento_pncp"]),
        nome: String(d["nome"] ?? ""),
        url: s(d["url"]),
        data_publicacao: s(d["data_publicacao"]),
        ativo: d["ativo"] !== false,
      })),
      historico: detalhe.historico.map((h) => ({
        id: String(h["id"]),
        em: String(h["em"]),
        texto: String(h["texto"]),
        origem: h["origem"] as "pncp" | "equipe",
      })),
      documentosPendentes: detalhe.documentosPendentes,
      documentosEstado: detalhe.documentosEstado as DetalheDTO["documentosEstado"],
      documentosColetadoEm: detalhe.documentosColetadoEm,
      documentosErro: detalhe.documentosErro,
    };
  });

export const metricasFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<MetricasDTO> => {
    const repo = await getRepo();
    const cfg = await repo.obterConfiguracoes();
    const m = await repo.metricasDashboard(cfg.score_minimo_recomendado);
    return m as unknown as MetricasDTO;
  },
);

export const opcoesFiltrosFn = createServerFn({ method: "POST" }).handler(async () => {
  const repo = await getRepo();
  return repo.opcoesFiltros();
});

export const listarModalidadesFn = createServerFn({ method: "POST" }).handler(async () => {
  const repo = await getRepo();
  return repo.listarModalidades();
});

/* --------------------------------------------------- campos internos ------ */

export const atualizarInternoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        statusInterno: z
          .enum(["nova", "em_analise", "interessante", "descartada", "proposta_enviada"])
          .optional(),
        prioridade: z.boolean().optional(),
        observacoes: z.string().max(10_000).optional(),
        historico: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const repo = await getRepo();
    const linha = await repo.atualizarLicitacaoInterna({
      id: data.id,
      statusInterno: data.statusInterno ?? null,
      prioridade: data.prioridade ?? null,
      observacoes: data.observacoes ?? null,
      historico: data.historico ?? null,
    });
    return paraDTO(linha);
  });

/* ------------------------------------------------------- configurações ---- */

export const obterConfiguracoesFn = createServerFn({ method: "POST" }).handler(async () => {
  const repo = await getRepo();
  return repo.obterConfiguracoes();
});

export const salvarConfiguracoesFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => configSchema.parse(d))
  .handler(async ({ data }) => {
    const repo = await getRepo();
    return repo.salvarConfiguracoes(data);
  });

/* ------------------------------------------------------- sincronização ---- */

function coberturaDe(
  job: SincronizacaoDTO | null,
  pendentes: number,
  falhados: number,
): ProgressoSyncDTO["cobertura"] {
  if (!job) return "nunca";
  if (job.status === "em_andamento") return "coletando";
  if (job.status === "falhou") return "falhou";
  // "Completo no escopo" exige todos os segmentos previstos percorridos, sem
  // lacuna conhecida (arquivo 04 §1). O que define isso são os segmentos, não o
  // rótulo do job: um aviso acessório — payload bruto não guardado, por exemplo —
  // marca o job como "concluído com erros" sem deixar buraco na coleta.
  if (
    pendentes === 0 &&
    falhados === 0 &&
    (job.status === "concluido" || job.status === "concluido_com_erros")
  ) {
    return "completo_no_escopo";
  }
  return "parcial";
}

export const iniciarSincronizacaoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => escopoSchema.partial().parse(d ?? {}))
  .handler(async ({ data }) => {
    const repo = await getRepo();
    const { planejarPropostasAbertas, descreverEscopo, etapasProgressivas } = await getPlanner();

    const emAndamento = await repo.jobEmAndamento();
    if (emAndamento) {
      return { jobId: emAndamento.id, reaproveitado: true };
    }

    const cfg = await repo.obterConfiguracoes();
    let modalidades = data.modalidades ?? cfg.modalidades_coleta;
    if (modalidades.length === 0) {
      modalidades = (await repo.listarModalidades()).filter((m) => m.ativo).map((m) => m.id);
    }

    const horizonte = data.horizonteDias ?? cfg.horizonte_dias;
    const etapasHorizonteDias =
      data.etapasHorizonteDias && data.etapasHorizonteDias.length > 0
        ? data.etapasHorizonteDias
        : data.emEtapas
          ? etapasProgressivas(horizonte)
          : [horizonte];

    const escopo = {
      ufs: data.ufs ?? cfg.ufs_coleta,
      modalidades,
      horizonteDias: horizonte,
      etapasHorizonteDias,
    };

    const segmentos = planejarPropostasAbertas(escopo);
    const job = await repo.criarSincronizacao(escopo, descreverEscopo(escopo), segmentos);

    return { jobId: job.id, reaproveitado: false };
  });

export const executarTickFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const repo = await getRepo();
    const { executarTick } = await getWorker();
    const cfg = await repo.obterConfiguracoes();

    const resumo = await executarTick(data.jobId, {
      banco: repo.portaIngestao(),
      cfg: {
        palavras_chave: cfg.palavras_chave,
        score_peso_palavras: cfg.score_peso_palavras,
        score_peso_documentos: cfg.score_peso_documentos,
        score_peso_valor: cfg.score_peso_valor,
      },
    });

    // A fronteira de cobertura só avança no fim, e só nas partições que
    // concluíram todas as suas janelas (arquivo 03 §4, item 6). Custa uma
    // consulta a mais, e só no último tick.
    if (resumo.jobConcluido) {
      const job = await repo.obterSincronizacao(data.jobId);
      if (job?.tipo === "incremental") await repo.avancarCobertura(data.jobId);
    }

    return resumo;
  });

export const statusSincronizacaoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ jobId: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data }): Promise<ProgressoSyncDTO> => {
    const repo = await getRepo();

    const job = (await repo.jobEmAndamento()) ?? (await repo.listarSincronizacoes(1))[0] ?? null;
    if (!job) {
      return { job: null, cobertura: "nunca", segmentos: null, percentual: null };
    }

    const alvo = data.jobId ?? job.id;
    const segmentos = await repo.progressoSegmentos(alvo);
    const percentual =
      segmentos.paginasEstimadas && segmentos.paginasEstimadas > 0
        ? Math.min(100, Math.round((segmentos.paginasAplicadas / segmentos.paginasEstimadas) * 100))
        : null;

    return {
      job: job as unknown as SincronizacaoDTO,
      cobertura: coberturaDe(
        job as unknown as SincronizacaoDTO,
        segmentos.pendentes,
        segmentos.falhados,
      ),
      segmentos,
      percentual,
    };
  });

export const listarSincronizacoesFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ limite: z.number().int().min(1).max(50).default(20) }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const repo = await getRepo();
    return (await repo.listarSincronizacoes(data.limite)) as unknown as SincronizacaoDTO[];
  });

export const interromperSincronizacaoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ jobId: z.string().uuid(), motivo: z.string().max(300).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const repo = await getRepo();
    // Interromper não apaga o que já foi gravado: o job fica parcial e pode ser
    // retomado, com o checkpoint de cada segmento preservado.
    //
    // Todo caminho que abandona um job precisa passar por aqui. Um job deixado
    // em 'em_andamento' trava o índice único e bloqueia QUALQUER sincronização
    // seguinte — aconteceu duas vezes em 14 e 15/09, nas duas por a fonte ter
    // falhado e o laço da tela ter saído sem encerrar nada.
    await repo.marcarJobParcial(data.jobId, data.motivo ?? "Interrompida pelo usuário");
    return { ok: true };
  });

/* ---------------------------------------------------- fila de documentos --- */

export const coberturaDocumentosFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<CoberturaDocumentosDTO> => {
    const repo = await getRepo();
    return (await repo.coberturaDocumentos()) as unknown as CoberturaDocumentosDTO;
  },
);

/**
 * Um passo da coleta de documentos. Assim como a sincronização, a fila avança
 * em ticks curtos: o runtime não tem processo longo, e cada chamada precisa
 * terminar em estado retomável. A tela chama de novo enquanto houver fila.
 */
export const executarTickDocumentosFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ maxLicitacoes: z.number().int().min(1).max(500).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<ResumoColetaDocumentosDTO> => {
    const repo = await getRepo();
    const { executarTickDocumentos } = await getWorkerDocumentos();
    const cfg = await repo.obterConfiguracoes();

    return executarTickDocumentos({
      banco: repo.portaDocumentos(),
      cfg: {
        palavras_chave: cfg.palavras_chave,
        score_peso_palavras: cfg.score_peso_palavras,
        score_peso_documentos: cfg.score_peso_documentos,
        score_peso_valor: cfg.score_peso_valor,
      },
      ...(data.maxLicitacoes ? { maxLicitacoesPorTick: data.maxLicitacoes } : {}),
    });
  });

/* ------------------------------------------ sincronização incremental (F3) */

const escopoIncrementalSchema = z.object({
  ufs: z.array(z.string().length(2)).min(1).max(27).optional(),
  modalidades: z.array(z.number().int().positive()).max(19).optional(),
  sobreposicaoDias: z.number().int().min(0).max(30).optional(),
  janelaDias: z.number().int().min(1).max(7).optional(),
});

/**
 * Planeja e abre um ciclo de atualização global.
 *
 * O custo aqui não é o do catálogo, é o do domínio: `/contratacoes/atualizacao`
 * exige modalidade, então cada UF vira uma partição por modalidade. Devolver a
 * contagem de segmentos deixa isso visível antes de a coleta começar.
 */
export const iniciarIncrementalFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => escopoIncrementalSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const repo = await getRepo();
    const { planejarIncremental, descreverIncremental } = await getPlanner();

    const cfg = await repo.obterConfiguracoes();
    const ufs = data.ufs ?? cfg.ufs_coleta;

    // A rota exige modalidade: "todas" precisa virar a lista real do domínio,
    // não a ausência de filtro que `/proposta` aceita.
    let modalidades = data.modalidades ?? cfg.modalidades_coleta;
    if (modalidades.length === 0) {
      modalidades = (await repo.listarModalidades()).filter((m) => m.ativo).map((m) => m.id);
    }

    // Sem carga inicial não há de quando partir, e inventar uma data faria o
    // ciclo varrer um passado arbitrário.
    const inicioPadrao = await repo.inicioPadraoIncremental();
    if (!inicioPadrao) {
      throw new Error(
        "Nenhuma sincronização de descoberta registrada: rode a coleta inicial antes do incremental.",
      );
    }

    const escopo = {
      ufs,
      modalidades,
      inicioPadrao,
      ...(data.sobreposicaoDias !== undefined ? { sobreposicaoDias: data.sobreposicaoDias } : {}),
      ...(data.janelaDias !== undefined ? { janelaDias: data.janelaDias } : {}),
    };

    const agora = new Date();
    const coberturas = await repo.listarCoberturaIncremental();
    const segmentos = planejarIncremental(escopo, coberturas, agora);

    if (segmentos.length === 0) {
      throw new Error("Nada a atualizar: todas as partições já estão na fronteira de hoje.");
    }

    const job = await repo.criarSincronizacao(
      escopo,
      descreverIncremental(escopo, segmentos.length),
      segmentos,
      // O recorte é fixado ANTES do primeiro GET; o fim do job não vira
      // "sincronizado até agora" (arquivo 03 §4).
      { tipo: "incremental", cutoff: agora.toISOString() },
    );

    return { jobId: job.id, segmentos: segmentos.length };
  });

export const coberturaIncrementalFn = createServerFn({ method: "POST" }).handler(async () => {
  const repo = await getRepo();
  return (await repo.diagnosticoCobertura()) as unknown as CoberturaIncrementalDTO;
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

const gerarAnaliseSchema = z.object({
  id: z.string().uuid(),
  forcar: z.boolean().default(false),
});

export const obterAnaliseLicitacaoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => idParamSchema.parse(d))
  .handler(async ({ data }): Promise<AnaliseLicitacaoDTO> => {
    const { repositorioAnalise } = await import("./analise/repositorio.analise.server");
    const analise = await repositorioAnalise.obterAnalise(data.id);
    if (!analise) {
      return {
        licitacaoId: data.id,
        estado: "nunca",
        resultado: null,
        fontes: [],
        cobertura: {
          estado: "indisponivel",
          ativos: 0,
          disponiveis: 0,
          falhos: 0,
          pendentes: 0,
        },
        modelo: null,
        erro: null,
        geradoEm: null,
        atualizadoEm: new Date().toISOString(),
      };
    }
    return {
      licitacaoId: analise.licitacaoId,
      estado: analise.estado,
      resultado: analise.resultado as unknown as AnaliseLicitacaoDTO["resultado"],
      fontes: (analise.fontes ?? []) as unknown as AnaliseLicitacaoDTO["fontes"],
      cobertura: (analise.cobertura ?? {
        estado: "indisponivel",
        ativos: 0,
        disponiveis: 0,
        falhos: 0,
        pendentes: 0,
      }) as unknown as AnaliseLicitacaoDTO["cobertura"],
      modelo: analise.modelo,
      erro: analise.erro,
      geradoEm: analise.geradoEm,
      atualizadoEm: analise.atualizadoEm,
    };
  });

export const gerarAnaliseLicitacaoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => gerarAnaliseSchema.parse(d))
  .handler(async ({ data }): Promise<AnaliseLicitacaoDTO> => {
    const { executarAnaliseLicitacao } = await import("./analise/orquestrador.server");
    const linha = await executarAnaliseLicitacao({
      licitacaoId: data.id,
      forcar: data.forcar,
    });
    return {
      licitacaoId: linha.licitacaoId,
      estado: linha.estado,
      resultado: linha.resultado as unknown as AnaliseLicitacaoDTO["resultado"],
      fontes: (linha.fontes ?? []) as unknown as AnaliseLicitacaoDTO["fontes"],
      cobertura: (linha.cobertura ?? {
        estado: "indisponivel",
        ativos: 0,
        disponiveis: 0,
        falhos: 0,
        pendentes: 0,
      }) as unknown as AnaliseLicitacaoDTO["cobertura"],
      modelo: linha.modelo,
      erro: linha.erro,
      geradoEm: linha.geradoEm,
      atualizadoEm: linha.atualizadoEm,
    };
  });

export const sincronizarDocumentosLicitacaoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { sincronizarArquivosLicitacaoSobDemanda } = await import(
      "./documentos/otimizador.server"
    );
    return sincronizarArquivosLicitacaoSobDemanda(data.id, {
      concorrencia: 4,
      maxArquivos: 6,
    });
  });

export interface ResultadoLoteLicitacao {
  id: string;
  ok: boolean;
  totalCatalogados?: number;
  extraidos?: number;
  erros?: string[];
}

export const sincronizarDocumentosLicitacoesLoteFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ ids: z.array(z.string().uuid()) }).parse(d))
  .handler(async ({ data }) => {
    const { sincronizarArquivosLicitacaoSobDemanda } = await import(
      "./documentos/otimizador.server"
    );
    const resultados: ResultadoLoteLicitacao[] = [];
    let totalExtraidos = 0;

    for (const id of data.ids) {
      try {
        const res = await sincronizarArquivosLicitacaoSobDemanda(id, {
          concorrencia: 3,
          maxArquivos: 6,
        });
        totalExtraidos += res.extraidos;
        resultados.push({
          id,
          ok: true,
          totalCatalogados: res.totalCatalogados,
          extraidos: res.extraidos,
          erros: res.erros,
        });
      } catch (err) {
        resultados.push({
          id,
          ok: false,
          totalCatalogados: 0,
          extraidos: 0,
          erros: [err instanceof Error ? err.message : String(err)],
        });
      }
    }

    return {
      sucesso: true,
      processadas: resultados.length,
      totalExtraidos,
      resultados,
    };
  });

export interface DocumentoBaixadoAlexandria {
  id: string;
  nome: string;
  tipo_documento: string;
  chars: number;
  paginas: number;
  url: string | null;
}

export interface LicitacaoAlexandriaDTO extends LicitacaoDTO {
  documentos_baixados: DocumentoBaixadoAlexandria[];
  analise_estado?: "nao_analisada" | "processando" | "pronta" | "erro";
  analise_resumo?: string | null;
}

export const obterLicitacoesAlexandriaFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        ids: z.array(z.string().uuid()).optional(),
        busca: z.string().optional(),
        statusInterno: z.string().optional(),
      })
      .optional()
      .parse(d),
  )
  .handler(async ({ data }): Promise<LicitacaoAlexandriaDTO[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Buscar licitações com documentos_estado completo ou nos IDs selecionados
    let query = supabaseAdmin
      .from("licitacoes")
      .select(`
        *,
        documentos_estado (estado),
        documentos_licitacao (
          id, nome, tipo_documento, url, ativo,
          documentos_arquivo (estado, chars, paginas)
        )
      `)
      .order("data_encerramento_proposta", { ascending: true, nullsFirst: false });

    if (data?.ids && data.ids.length > 0) {
      query = query.in("id", data.ids);
    } else {
      query = query.not("documentos_estado", "is", null);
    }

    if (data?.statusInterno && data.statusInterno !== "todos") {
      query = query.eq("status_interno", data.statusInterno);
    }

    const { data: linhas, error } = await query.limit(100);
    if (error) {
      console.error("Erro ao buscar licitações em Alexandria:", error);
      return [];
    }

    const licitacaoIds = (linhas ?? []).map((l: Record<string, unknown>) => String(l["id"]));
    let mapaAnalises = new Map<string, Record<string, unknown>>();
    if (licitacaoIds.length > 0) {
      const { data: analises } = await supabaseAdmin
        .from("licitacoes_analises")
        .select("licitacao_id, estado, resultado")
        .in("licitacao_id", licitacaoIds);
      mapaAnalises = new Map(
        (analises ?? []).map((a: Record<string, unknown>) => [String(a["licitacao_id"]), a]),
      );
    }

    const filtradas = (linhas ?? []).filter((l: Record<string, unknown>) => {
      if (data?.busca && data.busca.trim()) {
        const termo = data.busca.toLowerCase();
        const texto = `${l["objeto"]} ${l["orgao"]} ${l["municipio"]} ${l["numero_controle_pncp"]}`.toLowerCase();
        if (!texto.includes(termo)) return false;
      }
      return true;
    });

    return filtradas.map((l: Record<string, unknown>) => {
      const docs = ((l["documentos_licitacao"] as Array<Record<string, unknown>>) ?? []).filter(
        (d) => d["ativo"] !== false,
      );
      const docsBaixados: DocumentoBaixadoAlexandria[] = docs
        .filter((d) => Array.isArray(d["documentos_arquivo"]) && d["documentos_arquivo"].length > 0)
        .map((d) => {
          const arq = (d["documentos_arquivo"] as Array<Record<string, unknown>>)[0] ?? {};
          return {
            id: String(d["id"]),
            nome: String(d["nome"] ?? "Documento"),
            tipo_documento: String(d["tipo_documento"] ?? "outro"),
            chars: Number(arq["chars"] ?? 0),
            paginas: Number(arq["paginas"] ?? 1),
            url: d["url"] ? String(d["url"]) : null,
          };
        });

      const analise = mapaAnalises.get(String(l["id"]));
      const resultadoAnalise = analise?.["resultado"] as Record<string, unknown> | undefined;

      const baseDTO = paraDTO(l);
      return {
        ...baseDTO,
        documentos_total: docs.length,
        documentos_estado: docsBaixados.length > 0 ? "completo" : baseDTO.documentos_estado,
        documentos_baixados: docsBaixados,
        analise_estado: (analise?.["estado"] as LicitacaoAlexandriaDTO["analise_estado"]) ?? "nao_analisada",
        analise_resumo: (resultadoAnalise?.["resumo"] as string | undefined) ?? null,
      };
    });
  });

export const obterItensLicitacaoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        pagina: z.number().int().min(1).default(1),
        tamanhoPagina: z.number().int().min(1).max(100).default(100),
      })
      .parse(d),
  )
  .handler(
    async ({
      data,
    }): Promise<{ itens: ItemLicitacao[]; total: number; mensagem?: string | null }> => {
      const repo = await getRepo();
      const detalhe = await repo.obterLicitacao(data.id);
      if (!detalhe) return { itens: [], total: 0, mensagem: "Licitação não encontrada." };

      const lic = detalhe.licitacao;
      const cnpj = String(lic["cnpj_orgao"] ?? "").replace(/\D/g, "").padStart(14, "0");
      const ano = Number(lic["ano_compra"]);
      const sequencial = Number(lic["sequencial_compra"]);

      if (!cnpj || !ano || !sequencial) {
        return {
          itens: [],
          total: 0,
          mensagem:
            "Esta licitação não possui os identificadores completos (CNPJ, ano ou sequencial) para consulta de itens no PNCP.",
        };
      }

      try {
        const url = `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens?pagina=${data.pagina}&tamanhoPagina=${data.tamanhoPagina}`;
        const res = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) {
          if (res.status === 404) {
            return {
              itens: [],
              total: 0,
              mensagem: "Nenhum item cadastrado no PNCP para esta contratação.",
            };
          }
          return {
            itens: [],
            total: 0,
            mensagem: `O PNCP retornou status HTTP ${res.status} ao consultar os itens.`,
          };
        }

        const itensJson = await res.json();
        if (!Array.isArray(itensJson)) {
          return { itens: [], total: 0 };
        }

        const itens: ItemLicitacao[] = itensJson.map((it: Record<string, unknown>) => ({
          numeroItem: Number(it["numeroItem"] ?? 0),
          descricao: String(it["descricao"] ?? "").trim(),
          materialOuServico: it["materialOuServico"] ? String(it["materialOuServico"]) : null,
          materialOuServicoNome: it["materialOuServicoNome"]
            ? String(it["materialOuServicoNome"])
            : null,
          valorUnitarioEstimado: Number(it["valorUnitarioEstimado"] ?? 0),
          valorTotal: Number(it["valorTotal"] ?? 0),
          quantidade: Number(it["quantidade"] ?? 0),
          unidadeMedida: String(it["unidadeMedida"] ?? "").trim() || "un",
          orcamentoSigiloso: Boolean(it["orcamentoSigiloso"]),
          itemCategoriaId:
            typeof it["itemCategoriaId"] === "number" ? it["itemCategoriaId"] : null,
          itemCategoriaNome: it["itemCategoriaNome"] ? String(it["itemCategoriaNome"]) : null,
          patrimonio: it["patrimonio"] ? String(it["patrimonio"]) : null,
          codigoRegistroImobiliario: it["codigoRegistroImobiliario"]
            ? String(it["codigoRegistroImobiliario"])
            : null,
          criterioJulgamentoId:
            typeof it["criterioJulgamentoId"] === "number" ? it["criterioJulgamentoId"] : null,
          criterioJulgamentoNome: it["criterioJulgamentoNome"]
            ? String(it["criterioJulgamentoNome"])
            : null,
          situacaoCompraItem:
            typeof it["situacaoCompraItem"] === "number" ? it["situacaoCompraItem"] : null,
          situacaoCompraItemNome: it["situacaoCompraItemNome"]
            ? String(it["situacaoCompraItemNome"])
            : null,
          tipoBeneficio:
            typeof it["tipoBeneficio"] === "number" ? it["tipoBeneficio"] : null,
          tipoBeneficioNome: it["tipoBeneficioNome"] ? String(it["tipoBeneficioNome"]) : null,
          incentivoProdutivoBasico: Boolean(it["incentivoProdutivoBasico"]),
          dataInclusao: it["dataInclusao"] ? String(it["dataInclusao"]) : null,
          dataAtualizacao: it["dataAtualizacao"] ? String(it["dataAtualizacao"]) : null,
          temResultado: Boolean(it["temResultado"]),
          imagem: typeof it["imagem"] === "number" ? it["imagem"] : null,
          ncmNbsCodigo: it["ncmNbsCodigo"] ? String(it["ncmNbsCodigo"]) : null,
          ncmNbsDescricao: it["ncmNbsDescricao"] ? String(it["ncmNbsDescricao"]) : null,
          informacaoComplementar: it["informacaoComplementar"]
            ? String(it["informacaoComplementar"])
            : null,
        }));

        return {
          itens,
          total: itens.length,
        };
      } catch (e) {
        return {
          itens: [],
          total: 0,
          mensagem:
            e instanceof Error ? e.message : "Falha ao conectar com a API de itens do PNCP.",
        };
      }
    },
  );
