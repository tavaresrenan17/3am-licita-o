export type StatusInterno =
  "nova" | "em_analise" | "interessante" | "descartada" | "proposta_enviada";

export type TipoDocumento = "edital" | "projeto" | "orcamento" | "anexo" | "outro";

export type StatusSincronizacao =
  "nunca" | "em_andamento" | "concluido" | "concluido_com_erros" | "falhou";

export interface DocumentoLicitacao {
  id: string;
  licitacao_id: string;
  tipo_documento: TipoDocumento;
  nome: string;
  url: string;
  data_publicacao: string;
  created_at: string;
}

export interface HistoricoItem {
  id: string;
  em: string;
  texto: string;
}

export interface Licitacao {
  id: string;
  pncp_id: string;
  orgao: string;
  cnpj_orgao: string;
  municipio: string;
  uf: string;
  objeto: string;
  valor_estimado: number;
  data_publicacao: string;
  data_limite_proposta: string;
  modalidade: string;
  status_pncp: string;
  categoria: string;
  url_pncp: string;
  score_aderencia: number;
  status_interno: StatusInterno;
  observacoes: string;
  prioridade: boolean;
  created_at: string;
  updated_at: string;
  synced_at: string;
  documentos: DocumentoLicitacao[];
  historico: HistoricoItem[];
}

export interface ParametrosSincronizacao {
  periodo_inicio: string;
  periodo_fim: string;
  uf: string;
  municipio: string;
  modalidade: string;
  situacao: string;
  palavras_chave: string[];
  apenas_abertas: boolean;
  buscar_documentos: boolean;
}

export interface Sincronizacao {
  id: string;
  inicio_em: string;
  finalizado_em: string | null;
  status: Exclude<StatusSincronizacao, "nunca">;
  parametros_consulta: ParametrosSincronizacao;
  total_registros_consultados: number;
  total_novos: number;
  total_atualizados: number;
  total_documentos: number;
  total_ignorados: number;
  mensagem_erro: string | null;
  created_at: string;
}

export const ETAPAS_SYNC = [
  "Preparando consulta",
  "Consultando PNCP",
  "Processando licitações",
  "Baixando metadados dos documentos",
  "Salvando novas licitações",
  "Atualizando registros existentes",
  "Finalizando sincronização",
] as const;

export type EtapaSync = (typeof ETAPAS_SYNC)[number];

export interface ProgressoSync {
  status: StatusSincronizacao;
  etapa: EtapaSync | null;
  percentual: number | null;
  paginas_consultadas: number;
  paginas_total: number | null;
  registros_consultados: number;
  novos: number;
  atualizados: number;
  documentos: number;
  ignorados: number;
  iniciado_em: number | null;
  finalizado_em: number | null;
  erros: string[];
}

export interface Configuracoes {
  api_base_url: string;
  api_token: string;
  palavras_chave: string[];
  parametros_padrao: ParametrosSincronizacao;
  itens_por_pagina: number;
  colunas_visiveis: string[];
  score_peso_palavras: number;
  score_peso_documentos: number;
  score_peso_valor: number;
  score_minimo_recomendado: number;
}

export interface FiltrosLicitacoes {
  palavra_chave: string;
  uf: string;
  municipio: string;
  orgao: string;
  modalidade: string;
  valor_min: string;
  valor_max: string;
  publicacao_de: string;
  publicacao_ate: string;
  /** Entrou no nosso catálogo a partir desta data (AAAA-MM-DD). */
  criadas_de: string;
  limite_de: string;
  limite_ate: string;
  status_interno: string;
  prioridade: string;
  categoria: string;
  com_edital: boolean;
  com_projeto: boolean;
  com_orcamento: boolean;
  nao_analisadas: boolean;
  recomendadas: boolean;
  /** Situação 1 e prazo em curso, avaliados no instante da consulta. */
  apenas_abertas: boolean;
}

export type OrdenacaoCampo =
  "data_limite_proposta" | "valor_estimado" | "data_publicacao" | "score_aderencia";

export const filtrosVazios: FiltrosLicitacoes = {
  palavra_chave: "",
  uf: "",
  municipio: "",
  orgao: "",
  modalidade: "",
  valor_min: "",
  valor_max: "",
  publicacao_de: "",
  publicacao_ate: "",
  criadas_de: "",
  limite_de: "",
  limite_ate: "",
  status_interno: "",
  prioridade: "",
  categoria: "",
  com_edital: false,
  com_projeto: false,
  com_orcamento: false,
  nao_analisadas: false,
  recomendadas: false,
  // Regra do produto: o catálogo operacional só exibe oportunidades que ainda
  // aceitam proposta e cujo prazo foi informado pelo PNCP.
  apenas_abertas: true,
};

/** UFs para o recorte de coleta; o PNCP filtra por sigla da unidade administrativa. */
export const UFS = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
];

/**
 * Nome por extenso de cada UF. O catálogo guarda a sigla, que é o que o PNCP
 * devolve; painel e relatório precisam do nome que a equipe fala.
 */
export const UF_NOME: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AM: "Amazonas",
  AP: "Amapá",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MG: "Minas Gerais",
  MS: "Mato Grosso do Sul",
  MT: "Mato Grosso",
  PA: "Pará",
  PB: "Paraíba",
  PE: "Pernambuco",
  PI: "Piauí",
  PR: "Paraná",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RO: "Rondônia",
  RR: "Roraima",
  RS: "Rio Grande do Sul",
  SC: "Santa Catarina",
  SE: "Sergipe",
  SP: "São Paulo",
  TO: "Tocantins",
};

/**
 * Rótulo do estado temporal (D06). "Indeterminada" e "Inconsistente" precisam
 * aparecer como tais: dizer "proposta fechada" sobre uma licitação sem data
 * seria afirmar com certeza que não temos.
 */
export const SITUACAO_TEMPORAL_LABEL: Record<string, string> = {
  aberta: "proposta aberta agora",
  nao_iniciada: "proposta ainda não abriu",
  encerrada: "proposta encerrada",
  nao_divulgada: "não divulgada no PNCP",
  indeterminada: "prazo não informado",
  inconsistente: "prazos inconsistentes na fonte",
};

export const STATUS_INTERNO_LABEL: Record<StatusInterno, string> = {
  nova: "Nova",
  em_analise: "Em análise",
  interessante: "Interessante",
  descartada: "Descartada",
  proposta_enviada: "Proposta enviada",
};

export const MODALIDADES = [
  "Concorrência",
  "Pregão Eletrônico",
  "Tomada de Preços",
  "Dispensa",
  "Convite",
  "RDC",
];

export const CATEGORIAS = [
  "Obra nova",
  "Reforma",
  "Pavimentação",
  "Drenagem",
  "Infraestrutura urbana",
  "Manutenção predial",
  "Serviços de engenharia",
  "Outros",
];

export const PALAVRAS_CHAVE_PADRAO = [
  "obra",
  "construção",
  "reforma",
  "engenharia",
  "pavimentação",
  "drenagem",
  "manutenção predial",
  "infraestrutura",
  "escola",
  "hospital",
  "praça",
  "urbanização",
  "terraplenagem",
  "concreto",
  "cobertura",
  "elétrica",
  "hidráulica",
];

export interface ItemLicitacao {
  numeroItem: number;
  descricao: string;
  materialOuServico?: string | null;
  materialOuServicoNome?: string | null;
  valorUnitarioEstimado: number;
  valorTotal: number;
  quantidade: number;
  unidadeMedida: string;
  orcamentoSigiloso?: boolean;
  itemCategoriaId?: number | null;
  itemCategoriaNome?: string | null;
  patrimonio?: string | null;
  codigoRegistroImobiliario?: string | null;
  criterioJulgamentoId?: number | null;
  criterioJulgamentoNome?: string | null;
  situacaoCompraItem?: number | null;
  situacaoCompraItemNome?: string | null;
  tipoBeneficio?: number | null;
  tipoBeneficioNome?: string | null;
  incentivoProdutivoBasico?: boolean;
  dataInclusao?: string | null;
  dataAtualizacao?: string | null;
  temResultado?: boolean;
  imagem?: number | null;
  ncmNbsCodigo?: string | null;
  ncmNbsDescricao?: string | null;
  informacaoComplementar?: string | null;
}
