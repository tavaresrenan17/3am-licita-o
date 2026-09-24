/**
 * Itens de uma contratação no PNCP (`/compras/{ano}/{seq}/itens`).
 *
 * Usado pela aba Itens da ficha e pela análise com IA: quantidade, unidade,
 * valor unitário, benefício ME/EPP e situação de cada item são dados
 * estruturados que existem mesmo quando o órgão publica só o termo de
 * referência no PNCP.
 */
import type { ItemLicitacao } from "@/lib/types";

const textoOuNulo = (v: unknown) => (v ? String(v) : null);
const numeroOuNulo = (v: unknown) => (typeof v === "number" ? v : null);

export function mapearItemPncp(it: Record<string, unknown>): ItemLicitacao {
  return {
    numeroItem: Number(it["numeroItem"] ?? 0),
    descricao: String(it["descricao"] ?? "").trim(),
    materialOuServico: textoOuNulo(it["materialOuServico"]),
    materialOuServicoNome: textoOuNulo(it["materialOuServicoNome"]),
    valorUnitarioEstimado: Number(it["valorUnitarioEstimado"] ?? 0),
    valorTotal: Number(it["valorTotal"] ?? 0),
    quantidade: Number(it["quantidade"] ?? 0),
    unidadeMedida: String(it["unidadeMedida"] ?? "").trim() || "un",
    orcamentoSigiloso: Boolean(it["orcamentoSigiloso"]),
    itemCategoriaId: numeroOuNulo(it["itemCategoriaId"]),
    itemCategoriaNome: textoOuNulo(it["itemCategoriaNome"]),
    patrimonio: textoOuNulo(it["patrimonio"]),
    codigoRegistroImobiliario: textoOuNulo(it["codigoRegistroImobiliario"]),
    criterioJulgamentoId: numeroOuNulo(it["criterioJulgamentoId"]),
    criterioJulgamentoNome: textoOuNulo(it["criterioJulgamentoNome"]),
    situacaoCompraItem: numeroOuNulo(it["situacaoCompraItem"]),
    situacaoCompraItemNome: textoOuNulo(it["situacaoCompraItemNome"]),
    tipoBeneficio: numeroOuNulo(it["tipoBeneficio"]),
    tipoBeneficioNome: textoOuNulo(it["tipoBeneficioNome"]),
    incentivoProdutivoBasico: Boolean(it["incentivoProdutivoBasico"]),
    dataInclusao: textoOuNulo(it["dataInclusao"]),
    dataAtualizacao: textoOuNulo(it["dataAtualizacao"]),
    temResultado: Boolean(it["temResultado"]),
    imagem: numeroOuNulo(it["imagem"]),
    ncmNbsCodigo: textoOuNulo(it["ncmNbsCodigo"]),
    ncmNbsDescricao: textoOuNulo(it["ncmNbsDescricao"]),
    informacaoComplementar: textoOuNulo(it["informacaoComplementar"]),
  };
}

export interface IdentificacaoCompraPncp {
  cnpj: string;
  ano: number;
  sequencial: number;
}

/** CNPJ, ano e sequencial da compra, prontos para a URL; nulo se faltar algum. */
export function identificarCompraPncp(
  lic: Record<string, unknown>,
): IdentificacaoCompraPncp | null {
  // CNPJ pode ter letras desde a v2.5 do manual do PNCP: tirar só a pontuação.
  const cnpj = String(lic["cnpj_orgao"] ?? "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .padStart(14, "0");
  const ano = Number(lic["ano_compra"]);
  const sequencial = Number(lic["sequencial_compra"]);
  if (!lic["cnpj_orgao"] || !ano || !sequencial) return null;
  return { cnpj, ano, sequencial };
}
