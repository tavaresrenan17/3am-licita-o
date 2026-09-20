/**
 * CAPACIDADES DA API DE CONSULTA DO PNCP.
 *
 * Fonte: OpenAPI de produção (https://pncp.gov.br/api/consulta/v3/api-docs),
 * snapshot em `__fixtures__/openapi.json`, verificado em 11/09/2026.
 *
 * Regra do projeto: nenhum parâmetro sai daqui sem estar na lista permitida do
 * endpoint. Um HTTP 200 não prova que a fonte aplicou um filtro desconhecido —
 * servidores costumam ignorar o que não entendem. Por isso a validação acontece
 * antes da rede, e parâmetros fora do contrato viram erro, não requisição.
 */

export const PNCP_CONSULTA_BASE = "https://pncp.gov.br/api/consulta/v1";

/** Listagens de contratações usadas pelo projeto. */
export type EndpointPNCP = "proposta" | "publicacao" | "atualizacao";

export interface ParametrosConsulta {
  dataInicial?: string;
  dataFinal?: string;
  codigoModalidadeContratacao?: number;
  codigoModoDisputa?: number;
  uf?: string;
  codigoMunicipioIbge?: string;
  cnpj?: string;
  codigoUnidadeAdministrativa?: string;
  idUsuario?: number;
  pagina: number;
  tamanhoPagina?: number;
}

type NomeParametro = keyof ParametrosConsulta;

interface Capacidade {
  path: string;
  descricao: string;
  obrigatorios: readonly NomeParametro[];
  opcionais: readonly NomeParametro[];
  tamanhoPaginaMin: number;
  tamanhoPaginaMax: number;
}

/**
 * Diferenças que não podem se perder (arquivo 01 §2 e §5):
 * - `/proposta` NÃO aceita `dataInicial` nem `codigoModoDisputa`, e a modalidade
 *   é opcional nessa rota (confirmado por GET real sem modalidade).
 * - publicação e atualização exigem as duas datas e uma modalidade por requisição.
 * - `tamanhoPagina` das três listagens vai de 10 a 50; 51 foi rejeitado com 400.
 */
export const CAPACIDADES: Record<EndpointPNCP, Capacidade> = {
  proposta: {
    path: "/contratacoes/proposta",
    descricao: "Contratações com recebimento de propostas aberto",
    obrigatorios: ["dataFinal", "pagina"],
    opcionais: [
      "codigoModalidadeContratacao",
      "uf",
      "codigoMunicipioIbge",
      "cnpj",
      "codigoUnidadeAdministrativa",
      "idUsuario",
      "tamanhoPagina",
    ],
    tamanhoPaginaMin: 10,
    tamanhoPaginaMax: 50,
  },
  publicacao: {
    path: "/contratacoes/publicacao",
    descricao: "Contratações por data de publicação",
    obrigatorios: ["dataInicial", "dataFinal", "codigoModalidadeContratacao", "pagina"],
    opcionais: [
      "codigoModoDisputa",
      "uf",
      "codigoMunicipioIbge",
      "cnpj",
      "codigoUnidadeAdministrativa",
      "idUsuario",
      "tamanhoPagina",
    ],
    tamanhoPaginaMin: 10,
    tamanhoPaginaMax: 50,
  },
  atualizacao: {
    path: "/contratacoes/atualizacao",
    descricao: "Contratações por data de atualização global",
    obrigatorios: ["dataInicial", "dataFinal", "codigoModalidadeContratacao", "pagina"],
    opcionais: [
      "codigoModoDisputa",
      "uf",
      "codigoMunicipioIbge",
      "cnpj",
      "codigoUnidadeAdministrativa",
      "idUsuario",
      "tamanhoPagina",
    ],
    tamanhoPaginaMin: 10,
    tamanhoPaginaMax: 50,
  },
};

export const TAMANHO_PAGINA_PADRAO = 50;

export class ParametroInvalidoError extends Error {
  constructor(
    readonly parametro: string,
    readonly motivo: string,
  ) {
    super(`Parâmetro "${parametro}" inválido: ${motivo}`);
    this.name = "ParametroInvalidoError";
  }
}

const UF_RE = /^[A-Z]{2}$/;
const IBGE_RE = /^\d{7}$/;
// CNPJ é texto e pode conter letras desde a v2.5 do manual: não usar \d{14}.
const CNPJ_RE = /^[A-Za-z0-9]{14}$/;
const DATA_RE = /^\d{8}$/;

/** Valida AAAAMMDD como data real de calendário (rejeita 20260230). */
export function validarDataPncp(parametro: string, valor: string): string {
  if (!DATA_RE.test(valor)) {
    throw new ParametroInvalidoError(parametro, "esperado o formato AAAAMMDD");
  }
  const ano = Number(valor.slice(0, 4));
  const mes = Number(valor.slice(4, 6));
  const dia = Number(valor.slice(6, 8));
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  const real = d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
  if (!real) {
    throw new ParametroInvalidoError(parametro, `${valor} não é uma data de calendário`);
  }
  return valor;
}

function inteiroPositivo(parametro: string, valor: number, minimo = 1) {
  if (!Number.isInteger(valor) || valor < minimo) {
    throw new ParametroInvalidoError(
      parametro,
      `esperado inteiro maior ou igual a ${minimo}, recebido ${valor}`,
    );
  }
}

/**
 * Converte os parâmetros do projeto na query string do endpoint, validando tudo
 * antes da rede. Lança `ParametroInvalidoError` em qualquer desvio do contrato.
 */
export function montarQuery(endpoint: EndpointPNCP, params: ParametrosConsulta): URLSearchParams {
  const cap = CAPACIDADES[endpoint];
  const permitidos = new Set<string>([...cap.obrigatorios, ...cap.opcionais]);

  for (const [chave, valor] of Object.entries(params)) {
    if (valor === undefined || valor === null || valor === "") continue;
    if (!permitidos.has(chave)) {
      throw new ParametroInvalidoError(
        chave,
        `não faz parte do contrato de ${cap.path}; filtre esse critério no banco`,
      );
    }
  }

  for (const obrigatorio of cap.obrigatorios) {
    const valor = params[obrigatorio];
    if (valor === undefined || valor === null || valor === "") {
      throw new ParametroInvalidoError(obrigatorio, `é obrigatório em ${cap.path}`);
    }
  }

  const query = new URLSearchParams();

  if (params.dataInicial) {
    query.set("dataInicial", validarDataPncp("dataInicial", params.dataInicial));
  }
  if (params.dataFinal) {
    query.set("dataFinal", validarDataPncp("dataFinal", params.dataFinal));
  }
  if (params.dataInicial && params.dataFinal && params.dataInicial > params.dataFinal) {
    throw new ParametroInvalidoError("dataInicial", "posterior à dataFinal");
  }

  if (params.codigoModalidadeContratacao !== undefined) {
    inteiroPositivo("codigoModalidadeContratacao", params.codigoModalidadeContratacao);
    query.set("codigoModalidadeContratacao", String(params.codigoModalidadeContratacao));
  }

  if (params.codigoModoDisputa !== undefined) {
    inteiroPositivo("codigoModoDisputa", params.codigoModoDisputa);
    query.set("codigoModoDisputa", String(params.codigoModoDisputa));
  }

  if (params.uf) {
    if (!UF_RE.test(params.uf)) {
      throw new ParametroInvalidoError("uf", "esperadas 2 letras maiúsculas, ex.: SP");
    }
    query.set("uf", params.uf);
  }

  if (params.codigoMunicipioIbge) {
    if (!IBGE_RE.test(params.codigoMunicipioIbge)) {
      throw new ParametroInvalidoError("codigoMunicipioIbge", "esperados 7 dígitos");
    }
    query.set("codigoMunicipioIbge", params.codigoMunicipioIbge);
  }

  if (params.cnpj) {
    if (!CNPJ_RE.test(params.cnpj)) {
      throw new ParametroInvalidoError(
        "cnpj",
        "esperados 14 caracteres alfanuméricos, sem pontuação",
      );
    }
    query.set("cnpj", params.cnpj);
  }

  if (params.codigoUnidadeAdministrativa) {
    const v = params.codigoUnidadeAdministrativa;
    if (v.length < 1 || v.length > 30) {
      throw new ParametroInvalidoError(
        "codigoUnidadeAdministrativa",
        "comprimento fora do intervalo de 1 a 30",
      );
    }
    query.set("codigoUnidadeAdministrativa", v);
  }

  if (params.idUsuario !== undefined) {
    inteiroPositivo("idUsuario", params.idUsuario);
    query.set("idUsuario", String(params.idUsuario));
  }

  inteiroPositivo("pagina", params.pagina);
  query.set("pagina", String(params.pagina));

  const tamanho = params.tamanhoPagina ?? TAMANHO_PAGINA_PADRAO;
  if (
    !Number.isInteger(tamanho) ||
    tamanho < cap.tamanhoPaginaMin ||
    tamanho > cap.tamanhoPaginaMax
  ) {
    throw new ParametroInvalidoError(
      "tamanhoPagina",
      `esperado inteiro entre ${cap.tamanhoPaginaMin} e ${cap.tamanhoPaginaMax}, recebido ${tamanho}`,
    );
  }
  query.set("tamanhoPagina", String(tamanho));

  return query;
}

export function montarUrl(endpoint: EndpointPNCP, params: ParametrosConsulta): string {
  const query = montarQuery(endpoint, params);
  return `${PNCP_CONSULTA_BASE}${CAPACIDADES[endpoint].path}?${query.toString()}`;
}
