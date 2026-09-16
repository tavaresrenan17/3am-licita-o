/**
 * METADADOS DE DOCUMENTOS DE UMA CONTRATAÇÃO (Fase 4).
 *
 * Rota: GET {base de Integração}/orgaos/{cnpj}/compras/{ano}/{sequencial}/arquivos
 * (Manual de Integração v2.6 §11.8, mapeado no arquivo 08 §3).
 *
 * O arquivo 08 §3 exigia validar o envelope real antes de codificar sua leitura.
 * Sondagem de 14/09/2026 contra três contratações do catálogo:
 *
 * - a resposta é um ARRAY JSON puro, sem envelope `{data,totalRegistros}` e sem
 *   paginação — nada aqui pode reusar `validarEnvelope` da rota de listagem;
 * - responde em ~300 ms, contra 30–60 s da listagem: a fila cabe num tick;
 * - `tipoDocumentoId` só é confiável para Edital (2). Projeto, planilha
 *   orçamentária, BDI e termo de referência chegam todos como "Outros
 *   Documentos" (16), então a classificação precisa olhar o título;
 * - títulos vêm sujos: envoltos em aspas literais (`"\"edital.pdf\""`) e às
 *   vezes com mojibake da própria fonte (`planilhaorÃ§amentaria.pdf`).
 *
 * Nada aqui vai à rede: é conversão pura, coberta por teste.
 */
import type { TipoDocumento } from "@/lib/types";
import { paraInstanteUtc } from "./mapper";

export const PNCP_INTEGRACAO_BASE = "https://pncp.gov.br/api/pncp/v1";

/** Item do array devolvido por `/arquivos`, com os campos que usamos. */
export interface ArquivoPNCP {
  uri?: string | null;
  url?: string | null;
  statusAtivo?: boolean | null;
  dataPublicacaoPncp?: string | null;
  cnpj?: string | null;
  anoCompra?: number | null;
  sequencialCompra?: number | null;
  sequencialDocumento?: number | string | null;
  titulo?: string | null;
  tipoDocumentoNome?: string | null;
  tipoDocumentoDescricao?: string | null;
  tipoDocumentoId?: number | string | null;
}

/** Linha de `public.documentos_licitacao`. */
export interface DocumentoRow {
  licitacao_id: string;
  sequencial_documento: number;
  tipo_documento: TipoDocumento;
  tipo_documento_pncp: string | null;
  nome: string;
  url: string | null;
  data_publicacao: string | null;
  ativo: boolean;
}

export class ArquivoInvalidoError extends Error {
  constructor(motivo: string) {
    super(`Documento do PNCP inválido: ${motivo}`);
    this.name = "ArquivoInvalidoError";
  }
}

/* ------------------------------------------------------------------- URL ---- */

// CNPJ é texto e pode conter letras desde a v2.5 do manual: não usar \d{14}.
const CNPJ_RE = /^[A-Za-z0-9]{14}$/;

/**
 * Monta a URL de metadados dos documentos. Valida antes da rede pelo mesmo
 * princípio de `contract.ts`: identificador torto vira erro, não requisição.
 */
export function urlArquivos(cnpj: string, ano: number, sequencial: number): string {
  if (!CNPJ_RE.test(cnpj)) {
    throw new ArquivoInvalidoError(
      `cnpj "${cnpj}" não tem 14 caracteres alfanuméricos sem pontuação`,
    );
  }
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    throw new ArquivoInvalidoError(`ano "${ano}" fora do intervalo plausível`);
  }
  // O OpenAPI de Consulta declara mínimo 1 para `sequencial`; zero não existe.
  if (!Number.isInteger(sequencial) || sequencial < 1) {
    throw new ArquivoInvalidoError(`sequencial "${sequencial}" deve ser inteiro maior que zero`);
  }
  return `${PNCP_INTEGRACAO_BASE}/orgaos/${cnpj}/compras/${ano}/${sequencial}/arquivos`;
}

/* --------------------------------------------------------------- títulos ---- */

// "Ã"/"Â" seguidos de continuação UTF-8 é a assinatura de texto UTF-8 que foi
// lido como latin1 em algum ponto da cadeia — no caso, dentro do próprio PNCP.
// Escrito com `new RegExp` de propósito: num literal `/.../` estes intervalos
// teriam de aparecer como bytes crus, e caracteres de continuação UTF-8 soltos
// dentro de uma classe são ilegíveis no editor e frágeis em diff.
const SUSPEITA_MOJIBAKE = new RegExp("[\\u00c2-\\u00c3][\\u0080-\\u00bf]");

/**
 * Desfaz mojibake latin1↔utf-8 quando o texto tem a assinatura característica.
 * Reverte só o que volta a ser UTF-8 válido; qualquer dúvida preserva o
 * original, porque exibir "orÃ§amentaria" é melhor que corromper um nome bom.
 */
export function repararMojibake(texto: string): string {
  if (!SUSPEITA_MOJIBAKE.test(texto)) return texto;
  try {
    const bytes = Uint8Array.from(texto, (c) => {
      const codigo = c.charCodeAt(0);
      if (codigo > 0xff) throw new RangeError("fora do intervalo latin1");
      return codigo;
    });
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return texto;
  }
}

/**
 * Título exibível: repara mojibake, remove as aspas literais que a fonte
 * envolve em parte dos nomes e normaliza espaços.
 */
export function limparTitulo(bruto: string | null | undefined): string {
  if (!bruto) return "";
  let t = repararMojibake(String(bruto)).trim();
  while (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    t = t.slice(1, -1).trim();
  }
  return t.replace(/\s+/g, " ").trim();
}

/** Marcas de acento que o NFD separa das letras; mesmo motivo do RegExp acima. */
const DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g");

const normalizar = (s: string) => s.toLowerCase().normalize("NFD").replace(DIACRITICOS, "");

/* --------------------------------------------------------- classificação ---- */

/**
 * Regras sobre o título, em ordem de precedência. Orçamento vem antes de edital
 * de propósito: "edital52-26planilhaorçamentaria.pdf" é a planilha do edital, e
 * o termo mais específico é que descreve o arquivo.
 *
 * Termos com espaço são escritos por extenso uma vez só; a comparação também
 * roda sobre a forma compacta do título, porque nome de arquivo real vem tanto
 * separado ("termo de referencia.pdf") quanto colado
 * ("edital52-26termodereferencia.pdf", visto na sondagem).
 */
const REGRAS_TITULO: { tipo: TipoDocumento; termos: string[] }[] = [
  {
    tipo: "orcamento",
    termos: [
      "orcament",
      "planilha",
      "bdi",
      "composicao de custo",
      "composicao de preco",
      "curva abc",
      "cronograma fisico",
      "memoria de calculo",
      "sinapi",
      "sicro",
      "quantitativ",
    ],
  },
  {
    tipo: "projeto",
    termos: [
      "projeto",
      "proj_",
      "proj-",
      "memorial descritivo",
      "caderno de encargos",
      // "planta" sozinho não entra: casaria dentro de "implantacao".
      "planta baixa",
      "prancha",
      "croqui",
      "levantamento topografic",
      "sondagem",
    ],
  },
  {
    tipo: "anexo",
    termos: [
      "termo de referencia",
      "minuta",
      "anexo",
      // "contratacao" não casa com "contrato": as duas convivem sem conflito.
      "contrato",
      "ata de registro",
      "estudo tecnico preliminar",
      "matriz de risco",
      "mapa de risco",
    ],
  },
  // "Aviso de Contratação Direta" é o instrumento convocatório da dispensa:
  // para quem procura obra, cumpre o papel do edital. O rótulo original fica
  // guardado em `tipo_documento_pncp`, então nada se perde na tela.
  { tipo: "edital", termos: ["edital", "aviso de licitacao", "aviso de contratacao"] },
];

/** Tudo que não é letra ou dígito sai: junta "termo_de_referencia" e "termo de referencia". */
const compactar = (s: string) => s.replace(/[^a-z0-9]/g, "");

/** Aplica as regras acima a um texto qualquer — rótulo da fonte ou nome de arquivo. */
function casarTermos(texto: string): TipoDocumento | null {
  const t = normalizar(limparTitulo(texto));
  const compacto = compactar(t);

  for (const regra of REGRAS_TITULO) {
    const casa = regra.termos.some(
      (termo) =>
        t.includes(termo) ||
        // Só termos de várias palavras ganham a forma compacta. Aplicá-la a
        // "proj_" viraria "proj", que casaria dentro de qualquer palavra.
        (termo.includes(" ") && compacto.includes(compactar(termo))),
    );
    if (casa) return regra.tipo;
  }
  return null;
}

/**
 * O tipo declarado pela fonte, quando ela diz algo útil.
 *
 * "Outros Documentos" devolve null de propósito: na amostra de 14/09/2026 ele
 * cobria 108 de 195 documentos — projeto, planilha orçamentária e BDI juntos —,
 * então tratá-lo como classificação seria arquivar a maioria como sem tipo.
 * Rótulo desconhecido também devolve null: inventar um tipo aqui esconderia a
 * incerteza de quem lê a tela.
 */
export function classificarPorTipoPncp(nome: string | null | undefined): TipoDocumento | null {
  if (!nome) return null;
  if (normalizar(limparTitulo(nome)).includes("outros documentos")) return null;
  return casarTermos(nome);
}

/** Classificação pelo nome do arquivo, quando a fonte não se comprometeu. */
export function classificarPorTitulo(titulo: string | null | undefined): TipoDocumento | null {
  if (!titulo) return null;
  return casarTermos(titulo);
}

/**
 * Tipo do documento. O rótulo da fonte manda; o título decide o que ela deixou
 * como "Outros Documentos". Sem evidência, fica "outro" — nunca se chuta um
 * tipo que o score usaria como se fosse informação confirmada.
 */
export function classificarDocumento(arquivo: ArquivoPNCP): TipoDocumento {
  return (
    classificarPorTipoPncp(arquivo.tipoDocumentoNome ?? arquivo.tipoDocumentoDescricao) ??
    classificarPorTitulo(arquivo.titulo) ??
    "outro"
  );
}

/* ------------------------------------------------------------ mapeamento ---- */

function sequencialOuNulo(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

export interface MapeamentoDocumentos {
  linhas: DocumentoRow[];
  rejeitados: string[];
}

/**
 * Array de `/arquivos` → linhas do catálogo.
 *
 * Um item sem `sequencialDocumento` não tem identidade estável (é a chave única
 * junto da licitação), então vira evidência em `rejeitados` em vez de derrubar
 * o lote — mesma regra que o mapper de cabeçalhos aplica a registro sem
 * identidade. Repetição do mesmo sequencial mantém a última ocorrência.
 */
export function mapearArquivos(licitacaoId: string, arquivos: ArquivoPNCP[]): MapeamentoDocumentos {
  const porSequencial = new Map<number, DocumentoRow>();
  const rejeitados: string[] = [];

  for (const arquivo of arquivos) {
    const sequencial = sequencialOuNulo(arquivo.sequencialDocumento);
    if (sequencial === null) {
      rejeitados.push(
        `documento sem sequencialDocumento utilizável (título: ${
          limparTitulo(arquivo.titulo) || "sem título"
        })`,
      );
      continue;
    }

    porSequencial.set(sequencial, {
      licitacao_id: licitacaoId,
      sequencial_documento: sequencial,
      tipo_documento: classificarDocumento(arquivo),
      tipo_documento_pncp: limparTitulo(arquivo.tipoDocumentoNome) || null,
      nome: limparTitulo(arquivo.titulo),
      url: arquivo.url?.trim() || arquivo.uri?.trim() || null,
      // Sem offset, como no resto do PNCP: é horário de Brasília, não UTC.
      data_publicacao: paraInstanteUtc(arquivo.dataPublicacaoPncp),
      // A fonte marca como inativo o documento substituído ou retirado. Ele
      // continua no catálogo por rastreabilidade, mas não conta para o score.
      ativo: arquivo.statusAtivo !== false,
    });
  }

  return {
    linhas: [...porSequencial.values()].sort(
      (a, b) => a.sequencial_documento - b.sequencial_documento,
    ),
    rejeitados,
  };
}
