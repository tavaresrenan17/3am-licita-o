import type { Configuracoes, DocumentoLicitacao } from "./types";

/** Marcas de acento separadas pelo NFD; escrito assim para o fonte ficar ASCII. */
const DIACRITICOS = new RegExp("[\u0300-\u036f]", "g");

/** Mesma normalização de `categoria.ts`: minúscula sem acento. */
const normalizar = (s: string) => s.toLowerCase().normalize("NFD").replace(DIACRITICOS, "");

interface ScoreInput {
  objeto: string;
  modalidade: string;
  /** Nulo quando o PNCP não divulga o valor (orçamento sigiloso ou campo ausente). */
  valor_estimado: number | null;
  categoria: string;
  documentos: Pick<DocumentoLicitacao, "tipo_documento">[];
}

/**
 * Score de aderência à construção civil (0-100).
 * Regras simples e configuráveis: palavras-chave no objeto, documentos
 * técnicos disponíveis, faixa de valor e modalidade/categoria.
 */
export function calcularScore(
  l: ScoreInput,
  cfg: Pick<
    Configuracoes,
    "palavras_chave" | "score_peso_palavras" | "score_peso_documentos" | "score_peso_valor"
  >,
): number {
  // Acento é removido dos DOIS lados, como o classificador de categoria já faz.
  // Sem isso, "CONSTRUCAO DE ESCOLA" — grafia sem acento, comum em texto de
  // órgão público — não casava com a palavra-chave "construção", e a licitação
  // ficava abaixo do mínimo por um detalhe ortográfico. A normalização só
  // acrescenta correspondências: tudo que casava antes continua casando.
  const objeto = normalizar(l.objeto);
  const encontradas = cfg.palavras_chave.filter((p) => objeto.includes(normalizar(p))).length;
  const palavras = Math.min(1, encontradas / 3) * cfg.score_peso_palavras;

  const tipos = new Set(l.documentos.map((d) => d.tipo_documento));
  let docs = 0;
  if (tipos.has("projeto")) docs += 0.5;
  if (tipos.has("orcamento")) docs += 0.35;
  if (tipos.has("edital")) docs += 0.15;
  docs = Math.min(1, docs) * cfg.score_peso_documentos;

  // Valor desconhecido ou sigiloso recebe a faixa mínima e nunca é tratado como
  // preço conhecido (arquivo 08 §4): zero da fonte não significa "barato".
  const v = l.valor_estimado;
  const faixa =
    v === null ? 0.25 : v >= 1_000_000 ? 1 : v >= 300_000 ? 0.75 : v >= 100_000 ? 0.5 : 0.25;
  const valor = faixa * cfg.score_peso_valor;

  let extra = 0;
  if (["Concorrência", "Tomada de Preços", "RDC"].includes(l.modalidade)) extra += 4;
  if (l.categoria !== "Outros") extra += 4;

  const total = palavras + docs + valor + extra;
  return Math.max(0, Math.min(100, Math.round(total)));
}
