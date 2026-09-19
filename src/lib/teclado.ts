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
  /** Atributo `role` do elemento focado, em minúsculo; "" quando não há. */
  alvoRole: string;
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

/**
 * Tags cujo elemento já responde a teclado por conta própria.
 *
 * `option` e `summary` entram porque também têm ativação por tecla; `label`
 * não entra porque quem recebe o foco é o controle associado, não ela.
 */
const TAGS_INTERATIVAS = new Set([
  "input",
  "textarea",
  "select",
  "option",
  "button",
  "a",
  "summary",
]);

/**
 * `role` que declara um elemento qualquer (tipicamente uma `div`) como
 * interativo. É por aqui que passam os componentes do Radix: o item de menu
 * suspenso é uma `div role="menuitem"` e a ativação dele é o `Enter`.
 */
const ROLES_INTERATIVOS = new Set([
  // Os papéis de CONTÊINER entram aqui, e não só os de item, porque é o
  // contêiner que recebe o foco primeiro. Lido no fonte do Radix: ao abrir, o
  // menu foca o próprio elemento de conteúdo (`role="menu"`), e volta a focá-lo
  // sempre que o cursor sai de um item. Sem "menu" nesta lista, um `d` digitado
  // com o menu aberto classificava a licitação de trás — a mesma falha que a
  // regra existe para impedir, entrando pela porta do contêiner.
  "menu",
  "dialog",
  "alertdialog",
  "listbox",
  "combobox",
  "button",
  "link",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "tab",
  "checkbox",
  "radio",
  "switch",
  "textbox",
  "searchbox",
  "combobox",
  "spinbutton",
  "slider",
]);

/**
 * O alvo do evento já tem significado próprio para a tecla digitada.
 *
 * Esta é uma lista de PERMISSÃO invertida, e não uma lista de negação de
 * campos de texto: o atalho só dispara quando o foco está em algo inerte.
 * A versão anterior isentava apenas `input`/`textarea`/`select`, e por isso
 * engolia o `Enter` de qualquer botão ou link — um `Enter` em "Salvar" no
 * diálogo de observação perdia o texto digitado e navegava para outra tela.
 * Vale para TODAS as teclas, não só `Enter`: com o foco num botão, um `d`
 * digitado por distração classificaria a licitação selecionada por trás.
 */
export function alvoEhInterativo(
  alvoTag: string,
  alvoRole: string,
  alvoEditavel: boolean,
): boolean {
  if (alvoEditavel) return true;
  if (TAGS_INTERATIVAS.has(alvoTag.toLowerCase())) return true;
  return ROLES_INTERATIVOS.has(alvoRole.toLowerCase());
}

export function decidirAcaoTecla(e: EventoTecla): AcaoTriagem | null {
  // Regra 1: nada dispara quando o foco está num elemento que já responde a
  // teclado. Sem isto, escrever "edital" na busca descartaria uma licitação
  // no "d", e o "Enter" de qualquer botão viraria "abrir a licitação".
  if (alvoEhInterativo(e.alvoTag, e.alvoRole, e.alvoEditavel)) return null;

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
 * Classificar avança para o próximo item; as demais ações não mexem na seleção.
 *
 * O gesto real da triagem é "essa não, próxima": sem o avanço o ciclo vira
 * `d`, `j`, `d`, `j` em vez de `d`, `d`, `d`. Alternar prioridade NÃO avança,
 * porque marcar como prioritária é dizer "volto nesta", e não "terminei com
 * esta".
 */
export function avancaApos(acao: AcaoTriagem): boolean {
  return acao.tipo === "classificar";
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
