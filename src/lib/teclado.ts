/**
 * Qual ação uma tecla representa na triagem da lista.
 *
 * Isto é função pura de propósito: o projeto não tem biblioteca de teste de
 * componente e o Vitest roda em ambiente `node`. Pôr a decisão aqui permite
 * testar as regras de segurança sem DOM e sem dependência nova — e as regras
 * de segurança são o que separa um recurso útil de um que apaga o trabalho
 * alheio.
 */
import type { StatusInterno } from "./types";

export interface EventoTecla {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  /** Nome da tag do elemento focado, em minúsculo. */
  alvoTag: string;
  /** true quando o elemento focado é `contenteditable`. */
  alvoEditavel: boolean;
}

export type AcaoTriagem =
  | { tipo: "mover"; delta: 1 | -1 }
  | { tipo: "abrir" }
  | { tipo: "classificar"; status: StatusInterno }
  | { tipo: "prioridade" }
  | { tipo: "ajuda" };

export const ATALHOS: readonly { tecla: string; descricao: string }[] = [
  { tecla: "j / ↓", descricao: "próxima licitação" },
  { tecla: "k / ↑", descricao: "licitação anterior" },
  { tecla: "Enter", descricao: "abrir" },
  { tecla: "i", descricao: "marcar interessante" },
  { tecla: "a", descricao: "marcar em análise" },
  { tecla: "d", descricao: "descartar" },
  { tecla: "p", descricao: "alternar prioridade" },
  { tecla: "?", descricao: "mostrar estes atalhos" },
];

const CAMPOS_DE_TEXTO = new Set(["input", "textarea", "select"]);

export function decidirAcaoTecla(e: EventoTecla): AcaoTriagem | null {
  // Regra 1: nada dispara enquanto se digita. Sem isto, escrever "edital" na
  // busca descartaria uma licitação no "d".
  if (CAMPOS_DE_TEXTO.has(e.alvoTag.toLowerCase()) || e.alvoEditavel) return null;

  // Regra 2: modificador é do navegador, não nosso.
  if (e.ctrlKey || e.altKey || e.metaKey) return null;

  switch (e.key.length === 1 ? e.key.toLowerCase() : e.key) {
    case "j":
    case "ArrowDown":
      return { tipo: "mover", delta: 1 };
    case "k":
    case "ArrowUp":
      return { tipo: "mover", delta: -1 };
    case "Enter":
      return { tipo: "abrir" };
    case "i":
      return { tipo: "classificar", status: "interessante" };
    case "a":
      return { tipo: "classificar", status: "em_analise" };
    case "d":
      return { tipo: "classificar", status: "descartada" };
    case "p":
      return { tipo: "prioridade" };
    case "?":
      return { tipo: "ajuda" };
    default:
      return null;
  }
}

/**
 * Mantém o índice selecionado dentro da lista.
 *
 * Devolve -1 para lista vazia, que significa "nada selecionado" — e não 0, que
 * apontaria para um item inexistente.
 */
export function limitarIndice(indice: number, tamanho: number): number {
  if (tamanho <= 0) return -1;
  return Math.min(Math.max(indice, 0), tamanho - 1);
}
