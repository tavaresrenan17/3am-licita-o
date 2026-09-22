/**
 * Contrato entre servidor e telas.
 *
 * As colunas do banco usam os nomes do PNCP; a interface continua falando a
 * língua do produto (`data_limite_proposta`, `modalidade`, `status_pncp`). A
 * conversão acontece uma vez só, no servidor.
 */
import type { StatusInterno, TipoDocumento } from "./types";

export type SituacaoTemporal =
  "aberta" | "nao_iniciada" | "encerrada" | "nao_divulgada" | "indeterminada" | "inconsistente";

export type EstadoDocumentos = "pendente" | "coletando" | "completo" | "erro";

export interface LicitacaoDTO {
  id: string;
  pncp_id: string;
  orgao: string;
  cnpj_orgao: string;
  unidade_nome: string | null;
  municipio: string | null;
  uf: string | null;
  /** Distância em quilômetros calculada via Haversine até a cidade de origem/sede. */
  distancia_km?: number | null;
  objeto: string;
  /** Nulo quando o PNCP não divulga o valor. Nunca zero por conveniência. */
  valor_estimado: number | null;
  data_publicacao: string | null;
  data_abertura_proposta: string | null;
  data_limite_proposta: string | null;
  modalidade: string | null;
  modalidade_id: number | null;
  status_pncp: string | null;
  situacao_compra_id: number | null;
  /** Recalculada a cada consulta: prazo vence sem o PNCP gravar nada. */
  aberta: boolean;
  /**
   * Estado temporal por extenso (D06). "indeterminada" e "inconsistente"
   * existem para a tela não afirmar aberta nem fechada sobre dado ausente ou
   * incoerente — `aberta: false` sozinho diria "fechada" com falsa certeza.
   */
  situacao_temporal: SituacaoTemporal;
  categoria: string;
  score_aderencia: number;
  status_interno: StatusInterno;
  observacoes: string;
  prioridade: boolean;
  documentos_total: number;
  documentos_estado: EstadoDocumentos;
  /**
   * Trecho do edital que casou com a consulta, quando o resultado veio por
   * similaridade semântica. `null` em toda busca lexical.
   */
  trecho: string | null;
  /** true quando este resultado entrou pelo ranking vetorial, e não só pelo lexical. */
  origem_semantica: boolean;
  url_pncp: string | null;
  link_sistema_origem: string | null;
  informacao_complementar: string | null;
  processo: string | null;
  srp: boolean | null;
  data_atualizacao_global: string | null;
  synced_at: string;
  updated_at: string;
}

export interface DocumentoDTO {
  id: string;
  tipo_documento: TipoDocumento;
  /** Rótulo original do PNCP, preservado porque a maioria vem como "Outros Documentos". */
  tipo_documento_pncp: string | null;
  nome: string;
  url: string | null;
  data_publicacao: string | null;
  /** false = retirado ou substituído na fonte; não conta para o score. */
  ativo: boolean;
}

export interface HistoricoDTO {
  id: string;
  em: string;
  texto: string;
  origem: "pncp" | "equipe";
}

export interface ResultadoBuscaDTO {
  itens: LicitacaoDTO[];
  total: number;
  pagina: number;
  totalPaginas: number;
  consultadoEm: string;
  /**
   * Como o resultado foi produzido. `lexical` é o padrão e o caminho de
   * rollback exigido pela ADR-001; `hibrido` só aparece com a flag ligada.
   */
  modo: "lexical" | "hibrido";
  /** true quando caiu para o lexical por FALHA, e não por configuração. */
  degradou: boolean;
}

export interface DetalheDTO {
  licitacao: LicitacaoDTO;
  documentos: DocumentoDTO[];
  historico: HistoricoDTO[];
  /** true = documentos ainda não coletados; não confundir com "não existe". */
  documentosPendentes: boolean;
  documentosEstado: EstadoDocumentos;
  /** Quando a coleta concluiu. Nulo enquanto ela não rodou para esta licitação. */
  documentosColetadoEm: string | null;
  documentosErro: string | null;
}

/** Quanto do catálogo já teve os documentos coletados (Fase 4). */
export interface CoberturaDocumentosDTO {
  licitacoes_total: number;
  /** Licitações com os três identificadores que a rota `/arquivos` exige. */
  elegiveis: number;
  completas: number;
  com_erro: number;
  coletando: number;
  documentos_total: number;
  com_edital: number;
  com_projeto: number;
  com_orcamento: number;
  consultado_em: string;
}

/** De quando é o catálogo, por partição percorrida (Fase 3). */
export interface CoberturaIncrementalDTO {
  particoes: number;
  /**
   * Menor fronteira entre as partições, nunca a maior: a visão agregada não
   * pode ultrapassar a partição mais atrasada (arquivo 03 §4).
   */
  fronteira_agregada: string | null;
  particao_mais_atrasada: {
    uf: string;
    modalidade_id: number;
    ultima_data_fechada: string | null;
  } | null;
  nunca_cobertas: number;
  consultado_em: string | null;
  agora: string;
}

export interface ResumoColetaDocumentosDTO {
  licitacoesProcessadas: number;
  documentosGravados: number;
  documentosRemovidos: number;
  semDocumentos: number;
  filaVazia: boolean;
  erros: string[];
  duracaoMs: number;
}

export interface MetricasDTO {
  total: number;
  nao_analisadas: number;
  novas_ultima_sync: number;
  atualizadas_ultima_sync: number;
  /** Entraram no catálogo hoje, no calendário de Brasília. */
  novas_hoje: number;
  encerrando_ate_amanha: number;
  prazo_proximo: number;
  abertas: number;
  valor_total: number;
  sem_valor: number;
  prioritarias: number;
  recomendadas: number;
  /** Só licitações ainda abertas: ranking de onde ainda dá para disputar. */
  por_uf: { uf: string; qtd: number }[];
  top_locais: { local: string; qtd: number }[];
  por_categoria: { categoria: string; qtd: number }[];
  ultima_sync: SincronizacaoDTO | null;
  consultado_em: string;
}

export interface SincronizacaoDTO {
  id: string;
  tipo?: "descoberta" | "incremental" | string | null;
  status: "em_andamento" | "concluido" | "concluido_com_erros" | "parcial" | "falhou";
  descricao_escopo: string;
  segmentos_planejados: number;
  segmentos_concluidos: number;
  paginas_consultadas: number;
  registros_consultados: number;
  total_novos: number;
  total_atualizados: number;
  total_ignorados: number;
  /**
   * Recusados pela política de admissão. Diferente de "não mudou": estes nem
   * entraram, por escolha nossa, e a tela precisa dizer isso.
   */
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
  fonte_observada_em: string | null;
  mensagem_erro: string | null;
  inicio_em: string;
  finalizado_em: string | null;
}

export interface ConfiguracoesDTO {
  ufs_coleta: string[];
  modalidades_coleta: number[];
  horizonte_dias: number;
  palavras_chave: string[];
  score_peso_palavras: number;
  score_peso_documentos: number;
  score_peso_valor: number;
  score_minimo_recomendado: number;
  itens_por_pagina: number;
  colunas_visiveis: string[];
}

/** Chaves ausentes ou `undefined`: é o que o formulário e o zod `.partial()` produzem. */
export type PatchConfiguracoesDTO = {
  [K in keyof ConfiguracoesDTO]?: ConfiguracoesDTO[K] | undefined;
};

/** Estado de cobertura mostrado na tela (arquivo 04 §1). */
export type EstadoCobertura = "nunca" | "coletando" | "parcial" | "completo_no_escopo" | "falhou";

export interface ProgressoSyncDTO {
  job: SincronizacaoDTO | null;
  cobertura: EstadoCobertura;
  segmentos: {
    planejados: number;
    concluidos: number;
    pendentes: number;
    falhados: number;
    paginasAplicadas: number;
    paginasEstimadas: number | null;
  } | null;
  percentual: number | null;
}

export interface FonteEvidenciaDTO {
  id: string;
  documentoId: string;
  nome: string;
  tipo: string;
  ordem: number;
  trecho: string;
}

export interface CoberturaAnaliseDTO {
  estado: "completa" | "parcial" | "indisponivel";
  ativos: number;
  disponiveis: number;
  falhos: number;
  pendentes: number;
}

export interface AnaliseLicitacaoDTO {
  licitacaoId: string;
  estado: "nunca" | "processando" | "pronta" | "erro";
  resultado: {
    veredito: "favoravel" | "atencao" | "desfavoravel" | "insuficiente";
    confianca: "alta" | "media" | "baixa";
    resumoExecutivo: string;
    pontosImportantes: Array<{
      titulo: string;
      descricao: string;
      severidade?: string;
      fonteIds: string[];
    }>;
    pontosAtencao?: Array<{
      titulo: string;
      descricao: string;
      severidade?: string;
      fonteIds: string[];
    }>;
    itensNaoImportantes?: Array<{
      titulo: string;
      descricao: string;
      severidade?: string;
      fonteIds: string[];
    }>;
    prazos: Array<{
      titulo: string;
      descricao: string;
      severidade?: string;
      fonteIds: string[];
    }>;
    requisitos: Array<{
      titulo: string;
      descricao: string;
      severidade?: string;
      fonteIds: string[];
    }>;
    riscos: Array<{
      titulo: string;
      descricao: string;
      severidade?: string;
      fonteIds: string[];
    }>;
    proximosPassos: string[];
  } | null;
  fontes: FonteEvidenciaDTO[];
  cobertura: CoberturaAnaliseDTO;
  modelo: string | null;
  erro: string | null;
  geradoEm: string | null;
  atualizadoEm: string;
}
