/**
 * Fatos do certame calculados pelo sistema, não pela IA.
 *
 * Vêm dos dados estruturados do PNCP (situação da compra, prazo de proposta e
 * itens) e ficam salvos junto da análise. Motivo medido em 24/09/2026: no
 * credenciamento de Pompéia os 10 itens já estavam "Homologado" no PNCP e a
 * análise, que só lia o termo de referência, sugeriu participar.
 */
import type { ItemLicitacao } from "@/lib/types";

export type SituacaoCertame =
  | "revogado"
  | "anulado"
  | "suspenso"
  | "homologado"
  | "proposta_encerrada"
  | "aberto"
  | "indeterminado";

export interface FatosPncp {
  /** false quando o PNCP não respondeu a consulta de itens. */
  itensDisponiveis: boolean;
  totalItens: number;
  valorTotalItens: number;
  /** Itens com participação exclusiva ou cota reservada para ME/EPP. */
  itensMeEpp: number;
  situacoesItens: Record<string, number>;
  situacaoCertame: SituacaoCertame;
  motivoSituacao: string;
}

/** `situacaoCompraId` do PNCP que encerra ou paralisa o certame. */
const SITUACAO_COMPRA: Record<number, { situacao: SituacaoCertame; motivo: string }> = {
  2: { situacao: "revogado", motivo: "A contratação foi revogada no PNCP." },
  3: { situacao: "anulado", motivo: "A contratação foi anulada no PNCP." },
  4: { situacao: "suspenso", motivo: "A contratação está suspensa no PNCP." },
};

const BENEFICIO_ME_EPP = /exclusiv|cota reservada/i;

/** Datas do PNCP vêm sem fuso e são horário de Brasília. */
function instante(valor: unknown): number | null {
  if (typeof valor !== "string" || valor.trim() === "") return null;
  const texto = /(?:Z|[+-]\d{2}:?\d{2})$/.test(valor) ? valor : `${valor}-03:00`;
  const ms = Date.parse(texto);
  return Number.isNaN(ms) ? null : ms;
}

const moeda = (v: number) => Math.round(v * 100) / 100;

export function calcularFatosPncp(
  licitacao: Record<string, unknown>,
  itens: readonly ItemLicitacao[] | null,
  agora: Date,
): FatosPncp {
  const lista = itens ?? [];
  const situacoesItens: Record<string, number> = {};
  for (const item of lista) {
    const nome = item.situacaoCompraItemNome ?? "Sem situação informada";
    situacoesItens[nome] = (situacoesItens[nome] ?? 0) + 1;
  }

  const base = {
    itensDisponiveis: itens !== null,
    totalItens: lista.length,
    valorTotalItens: moeda(lista.reduce((soma, item) => soma + (item.valorTotal || 0), 0)),
    itensMeEpp: lista.filter((item) => BENEFICIO_ME_EPP.test(item.tipoBeneficioNome ?? "")).length,
    situacoesItens,
  };

  const porSituacao = SITUACAO_COMPRA[Number(licitacao["situacao_compra_id"])];
  if (porSituacao) {
    return { ...base, situacaoCertame: porSituacao.situacao, motivoSituacao: porSituacao.motivo };
  }

  const comResultado = (item: ItemLicitacao) =>
    item.temResultado === true || /homologad/i.test(item.situacaoCompraItemNome ?? "");
  if (lista.length > 0 && lista.every(comResultado)) {
    return {
      ...base,
      situacaoCertame: "homologado",
      motivoSituacao: `Todos os ${lista.length} itens já têm resultado (homologados) no PNCP.`,
    };
  }

  const encerramento = instante(licitacao["data_encerramento_proposta"]);
  if (encerramento === null) {
    return {
      ...base,
      situacaoCertame: "indeterminado",
      motivoSituacao: "O PNCP não informa a data de encerramento das propostas.",
    };
  }
  if (encerramento < agora.getTime()) {
    return {
      ...base,
      situacaoCertame: "proposta_encerrada",
      motivoSituacao: "O prazo de envio de propostas já terminou.",
    };
  }
  return { ...base, situacaoCertame: "aberto", motivoSituacao: "Recebendo propostas." };
}
