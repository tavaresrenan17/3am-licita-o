# Triagem de Licitações Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colocar na tela os nove filtros que só existem no backend e dar à lista uma triagem por teclado, para que classificar 8.756 licitações deixe de exigir mirar e clicar em cada uma.

**Architecture:** Duas funções puras carregam a lógica — `filtros.ts` descreve cada filtro como dado (rótulo, grupo, como virar chip) e `teclado.ts` decide qual ação uma tecla representa. A tela passa a gerar painel e chips a partir da primeira, e um hook fino liga a segunda ao `window`. Nenhuma mudança no servidor: os nove filtros já existem nas duas funções SQL de busca.

**Tech Stack:** React 19, TanStack Router e Query, Tailwind 4, componentes Radix/shadcn já presentes, Vitest em ambiente `node`.

**Spec:** [`docs/superpowers/specs/2026-09-19-triagem-licitacoes-design.md`](../specs/2026-09-19-triagem-licitacoes-design.md)

## Global Constraints

- **Desktop apenas.** O solicitante confirmou que o uso é em computador. Não acrescente breakpoints, não mexa na `min-w-[1120px]` da tabela, não crie layout de cartão.
- **Nenhuma dependência nova.** O projeto não tem biblioteca de teste de componente e o Vitest roda com `environment: "node"`. Toda lógica que precisa de teste vive em função pura testável sem DOM. Se você se pegar querendo instalar `@testing-library/*` ou `jsdom`, pare: a lógica está no lugar errado.
- **Testes ficam em `src/**/*.test.ts`** — é o único padrão que o `vitest.config.ts` coleta.
- **Comentários em português**, explicando a invariante ou a medição por trás da decisão, no estilo dos arquivos existentes.
- **Nada no servidor.** Não edite `supabase/`, `src/services/pncp/` nem `src/services/busca/`. Os filtros já existem lá.
- **A URL não é espelho dos filtros.** `src/routes/licitacoes.index.tsx` documenta essa decisão deliberada. Não acrescente `navigate({ search })` a cada mudança de filtro. O compartilhamento é resolvido pelo botão de copiar link da Task 5.
- **`apenas_abertas` não ganha controle.** A função de servidor força `true` em toda requisição (`licitacoes.functions.ts`), com o comentário de que a API nunca devolve licitação encerrada. Um controle ali mentiria para o usuário.
- Verificação de cada task que toca a tela: `npx tsc --noEmit`, `npm test` e `npx eslint` nos arquivos alterados.

---

## File Structure

**Criados:**

| arquivo | responsabilidade |
|---|---|
| `src/lib/filtros.ts` | descreve cada filtro como dado: rótulo, grupo, tipo, como virar chip; e os atalhos de prazo |
| `src/lib/filtros.test.ts` | cobertura das definições, incluindo a guarda contra filtro órfão |
| `src/lib/teclado.ts` | decide qual ação uma tecla representa; limita o índice selecionado |
| `src/lib/teclado.test.ts` | as regras de segurança do atalho |
| `src/hooks/useTriagemTeclado.ts` | fio condutor: liga `teclado.ts` ao `window` e mantém a seleção |

**Modificados:** `src/routes/licitacoes.index.tsx` (chips, painel de filtros, lista com seleção e atalhos).

---

## Task 1: O vocabulário dos filtros

**Files:**
- Create: `src/lib/filtros.ts`
- Test: `src/lib/filtros.test.ts`

**Interfaces:**
- Consumes: `FiltrosLicitacoes` de `@/lib/types`.
- Produces:
```ts
type GrupoFiltro = "prazo" | "documentos" | "fluxo" | "local" | "valor";
interface DefinicaoFiltro {
  chave: keyof FiltrosLicitacoes;
  rotulo: string;
  grupo: GrupoFiltro;
  tipo: "texto" | "data" | "moeda" | "booleano" | "opcoes" | "tri";
  descrever: (valor: string | boolean) => string;
}
const DEFINICOES: readonly DefinicaoFiltro[];
const SEM_CONTROLE: ReadonlySet<keyof FiltrosLicitacoes>;
const GRUPOS_ABERTOS: readonly GrupoFiltro[];
function definicoesDoGrupo(grupo: GrupoFiltro): DefinicaoFiltro[];
function presetPrazo(dias: number, hoje?: Date): { limite_de: string; limite_ate: string };
```

- [ ] **Step 1: Write the failing test**

Criar `src/lib/filtros.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { filtrosVazios, type FiltrosLicitacoes } from "./types";
import {
  DEFINICOES,
  GRUPOS_ABERTOS,
  SEM_CONTROLE,
  definicoesDoGrupo,
  presetPrazo,
} from "./filtros";

describe("DEFINICOES", () => {
  it("cobre TODA chave de FiltrosLicitacoes", () => {
    // Esta é a regressão que este trabalho conserta: nove filtros existiam no
    // banco e nunca chegaram à tela. Se alguém acrescentar um filtro novo e
    // esquecer a interface, é aqui que aparece.
    const descritas = new Set(DEFINICOES.map((d) => d.chave));
    const orfas = (Object.keys(filtrosVazios) as (keyof FiltrosLicitacoes)[]).filter(
      (k) => !descritas.has(k) && !SEM_CONTROLE.has(k),
    );
    expect(orfas).toEqual([]);
  });

  it("nao descreve filtro que o servidor impoe", () => {
    // `apenas_abertas` é forçado true em toda requisição; um controle mentiria.
    expect(SEM_CONTROLE.has("apenas_abertas")).toBe(true);
    expect(DEFINICOES.some((d) => d.chave === "apenas_abertas")).toBe(false);
  });

  it("nao tem chave repetida", () => {
    expect(new Set(DEFINICOES.map((d) => d.chave)).size).toBe(DEFINICOES.length);
  });

  it("poe os nove filtros que faltavam nos grupos certos", () => {
    const grupoDe = (c: string) => DEFINICOES.find((d) => d.chave === c)?.grupo;
    expect(grupoDe("com_edital")).toBe("documentos");
    expect(grupoDe("com_projeto")).toBe("documentos");
    expect(grupoDe("com_orcamento")).toBe("documentos");
    expect(grupoDe("limite_de")).toBe("prazo");
    expect(grupoDe("limite_ate")).toBe("prazo");
    expect(grupoDe("criadas_de")).toBe("prazo");
    expect(grupoDe("recomendadas")).toBe("fluxo");
    expect(grupoDe("nao_analisadas")).toBe("fluxo");
    expect(grupoDe("prioridade")).toBe("fluxo");
  });

  it("abre so os grupos onde a decisao de triagem acontece", () => {
    expect([...GRUPOS_ABERTOS].sort()).toEqual(["fluxo", "prazo"]);
  });
});

describe("descrever", () => {
  it("booleano vira o proprio rotulo, sem 'sim'", () => {
    const d = DEFINICOES.find((x) => x.chave === "com_edital")!;
    expect(d.descrever(true)).toBe("Com edital");
  });

  it("data sai no formato brasileiro", () => {
    const d = DEFINICOES.find((x) => x.chave === "limite_ate")!;
    expect(d.descrever("2026-09-30")).toBe("Encerra até 30/09/2026");
  });

  it("tri distingue sim de nao", () => {
    const d = DEFINICOES.find((x) => x.chave === "prioridade")!;
    expect(d.descrever("sim")).toBe("Prioritárias");
    expect(d.descrever("nao")).toBe("Não prioritárias");
  });

  it("moeda sai formatada", () => {
    const d = DEFINICOES.find((x) => x.chave === "valor_min")!;
    expect(d.descrever("50000")).toContain("50.000");
  });
});

describe("definicoesDoGrupo", () => {
  it("devolve so o grupo pedido e nao devolve vazio", () => {
    const docs = definicoesDoGrupo("documentos");
    expect(docs.length).toBe(3);
    expect(docs.every((d) => d.grupo === "documentos")).toBe(true);
  });
});

describe("presetPrazo", () => {
  it("monta a faixa de hoje ate hoje mais N dias", () => {
    const r = presetPrazo(7, new Date("2026-09-19T12:00:00"));
    expect(r.limite_de).toBe("2026-09-19");
    expect(r.limite_ate).toBe("2026-09-26");
  });

  it("atravessa a virada de mes", () => {
    const r = presetPrazo(15, new Date("2026-09-25T12:00:00"));
    expect(r.limite_ate).toBe("2026-10-10");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/filtros.test.ts`
Expected: FAIL com `Failed to resolve import "./filtros"`.

- [ ] **Step 3: Write the implementation**

Criar `src/lib/filtros.ts`:

```ts
/**
 * O vocabulário dos filtros, descrito como dado.
 *
 * Antes disto, o painel e os chips eram markup solto dentro de um arquivo de
 * 886 linhas, e acrescentar um filtro exigia editar três lugares. O resultado
 * medido: nove dos vinte filtros que o backend aceita nunca chegaram à tela, e
 * sete deles já eram aceitos pela URL — o Dashboard abria recortes que o
 * usuário não conseguia ver nem alterar.
 *
 * Com a descrição centralizada, acrescentar um filtro é acrescentar uma linha,
 * e o teste de cobertura falha se alguém esquecer.
 */
import { brl, dataBR, diaBR } from "./format";
import type { FiltrosLicitacoes } from "./types";

export type GrupoFiltro = "prazo" | "documentos" | "fluxo" | "local" | "valor";

export interface DefinicaoFiltro {
  chave: keyof FiltrosLicitacoes;
  rotulo: string;
  grupo: GrupoFiltro;
  /**
   * "booleano" é liga/desliga. "tri" tem três estados — sim, não e
   * indiferente — porque `prioridade` viaja como "", "sim" ou "nao", e
   * indiferente não é o mesmo que não.
   */
  tipo: "texto" | "data" | "moeda" | "booleano" | "opcoes" | "tri";
  /** Como o chip de filtro ativo descreve o valor escolhido. */
  descrever: (valor: string | boolean) => string;
}

/**
 * Filtros que o servidor impõe e a tela não deve oferecer.
 *
 * `apenas_abertas` é forçado `true` em toda requisição por
 * `buscarLicitacoesFn`, com o comentário de que a API nunca devolve licitação
 * encerrada. Um controle aqui daria ao usuário a impressão de que ele pode
 * desligar algo que não pode.
 */
export const SEM_CONTROLE: ReadonlySet<keyof FiltrosLicitacoes> = new Set(["apenas_abertas"]);

/** Grupos que nascem abertos: é onde a decisão de triagem acontece. */
export const GRUPOS_ABERTOS: readonly GrupoFiltro[] = ["prazo", "fluxo"];

export const DEFINICOES: readonly DefinicaoFiltro[] = [
  // --- busca
  { chave: "palavra_chave", rotulo: "Busca", grupo: "local", tipo: "texto",
    descrever: (v) => `Busca: ${v}` },

  // --- local
  { chave: "uf", rotulo: "UF", grupo: "local", tipo: "opcoes", descrever: (v) => String(v) },
  { chave: "municipio", rotulo: "Município", grupo: "local", tipo: "opcoes",
    descrever: (v) => String(v) },
  { chave: "orgao", rotulo: "Órgão", grupo: "local", tipo: "opcoes", descrever: (v) => String(v) },

  // --- prazo
  { chave: "limite_de", rotulo: "Encerra a partir de", grupo: "prazo", tipo: "data",
    descrever: (v) => `Encerra a partir de ${dataBR(String(v))}` },
  { chave: "limite_ate", rotulo: "Encerra até", grupo: "prazo", tipo: "data",
    descrever: (v) => `Encerra até ${dataBR(String(v))}` },
  { chave: "publicacao_de", rotulo: "Publicada de", grupo: "prazo", tipo: "data",
    descrever: (v) => `Publicadas desde ${dataBR(String(v))}` },
  { chave: "publicacao_ate", rotulo: "Publicada até", grupo: "prazo", tipo: "data",
    descrever: (v) => `Publicadas até ${dataBR(String(v))}` },
  { chave: "criadas_de", rotulo: "No catálogo desde", grupo: "prazo", tipo: "data",
    descrever: (v) => `No catálogo desde ${dataBR(String(v))}` },

  // --- documentos
  { chave: "com_edital", rotulo: "Com edital", grupo: "documentos", tipo: "booleano",
    descrever: () => "Com edital" },
  { chave: "com_projeto", rotulo: "Com projeto", grupo: "documentos", tipo: "booleano",
    descrever: () => "Com projeto" },
  { chave: "com_orcamento", rotulo: "Com orçamento", grupo: "documentos", tipo: "booleano",
    descrever: () => "Com orçamento" },

  // --- meu fluxo
  { chave: "status_interno", rotulo: "Status interno", grupo: "fluxo", tipo: "opcoes",
    descrever: (v) => `Status: ${v}` },
  { chave: "recomendadas", rotulo: "Só recomendadas", grupo: "fluxo", tipo: "booleano",
    descrever: () => "Recomendadas" },
  { chave: "nao_analisadas", rotulo: "Só não analisadas", grupo: "fluxo", tipo: "booleano",
    descrever: () => "Não analisadas" },
  { chave: "prioridade", rotulo: "Prioridade", grupo: "fluxo", tipo: "tri",
    descrever: (v) => (v === "sim" ? "Prioritárias" : "Não prioritárias") },

  // --- valor e classificação
  { chave: "valor_min", rotulo: "Valor mínimo", grupo: "valor", tipo: "moeda",
    descrever: (v) => `A partir de ${brl(Number(v))}` },
  { chave: "valor_max", rotulo: "Valor máximo", grupo: "valor", tipo: "moeda",
    descrever: (v) => `Até ${brl(Number(v))}` },
  { chave: "modalidade", rotulo: "Modalidade", grupo: "valor", tipo: "opcoes",
    descrever: (v) => String(v) },
  { chave: "categoria", rotulo: "Categoria", grupo: "valor", tipo: "opcoes",
    descrever: (v) => String(v) },
];

export function definicoesDoGrupo(grupo: GrupoFiltro): DefinicaoFiltro[] {
  return DEFINICOES.filter((d) => d.grupo === grupo);
}

/**
 * Atalho de prazo: "o que encerra nos próximos N dias".
 *
 * Quem caça licitação pensa em "o que fecha essa semana", e não em duas datas
 * no formato ISO.
 *
 * Usa `diaBR` de `./format`, e não `Date` local: aquela função já resolve o
 * fuso de São Paulo, e o comentário dela explica por que isso importa — perto
 * da meia-noite o dia em UTC já virou e o da equipe não. Reimplementar aqui
 * reintroduziria um bug que o projeto já consertou.
 */
export function presetPrazo(
  dias: number,
  agora: Date = new Date(),
): { limite_de: string; limite_ate: string } {
  return { limite_de: diaBR(0, agora), limite_ate: diaBR(dias, agora) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/filtros.test.ts`
Expected: PASS, 11 testes.

Se o teste de cobertura falhar listando chaves órfãs, **não apague o teste**: acrescente a definição que falta. Esse teste é o ponto do trabalho.

- [ ] **Step 5: Verify types and the whole suite**

Run: `npx tsc --noEmit && npm test`
Expected: sem erros; a suíte continua verde.

- [ ] **Step 6: Commit**

```bash
git add src/lib/filtros.ts src/lib/filtros.test.ts
git commit -m "feat(ux): descrever os filtros como dado, com guarda contra filtro orfao"
```

---

## Task 2: A decisão do teclado

**Files:**
- Create: `src/lib/teclado.ts`
- Test: `src/lib/teclado.test.ts`

**Interfaces:**
- Consumes: `StatusInterno` de `@/lib/types`.
- Produces:
```ts
interface EventoTecla {
  key: string; ctrlKey: boolean; altKey: boolean; metaKey: boolean;
  alvoTag: string; alvoEditavel: boolean;
}
type AcaoTriagem =
  | { tipo: "mover"; delta: 1 | -1 }
  | { tipo: "abrir" }
  | { tipo: "classificar"; status: StatusInterno }
  | { tipo: "prioridade" }
  | { tipo: "ajuda" };
function decidirAcaoTecla(e: EventoTecla): AcaoTriagem | null;
function limitarIndice(indice: number, tamanho: number): number;
const ATALHOS: readonly { tecla: string; descricao: string }[];
```

- [ ] **Step 1: Write the failing test**

Criar `src/lib/teclado.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ATALHOS, decidirAcaoTecla, limitarIndice, type EventoTecla } from "./teclado";

const ev = (over: Partial<EventoTecla>): EventoTecla => ({
  key: "j",
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  alvoTag: "body",
  alvoEditavel: false,
  ...over,
});

describe("decidirAcaoTecla", () => {
  it("move para frente e para tras", () => {
    expect(decidirAcaoTecla(ev({ key: "j" }))).toEqual({ tipo: "mover", delta: 1 });
    expect(decidirAcaoTecla(ev({ key: "ArrowDown" }))).toEqual({ tipo: "mover", delta: 1 });
    expect(decidirAcaoTecla(ev({ key: "k" }))).toEqual({ tipo: "mover", delta: -1 });
    expect(decidirAcaoTecla(ev({ key: "ArrowUp" }))).toEqual({ tipo: "mover", delta: -1 });
  });

  it("classifica", () => {
    expect(decidirAcaoTecla(ev({ key: "i" }))).toEqual({ tipo: "classificar", status: "interessante" });
    expect(decidirAcaoTecla(ev({ key: "a" }))).toEqual({ tipo: "classificar", status: "em_analise" });
    expect(decidirAcaoTecla(ev({ key: "d" }))).toEqual({ tipo: "classificar", status: "descartada" });
  });

  it("abre, prioriza e pede ajuda", () => {
    expect(decidirAcaoTecla(ev({ key: "Enter" }))).toEqual({ tipo: "abrir" });
    expect(decidirAcaoTecla(ev({ key: "p" }))).toEqual({ tipo: "prioridade" });
    expect(decidirAcaoTecla(ev({ key: "?" }))).toEqual({ tipo: "ajuda" });
  });

  it("IGNORA tudo enquanto o foco esta num campo de texto", () => {
    // O defeito clássico deste recurso: o usuário digita "edital" na busca e o
    // "d" descarta uma licitação. Cada tipo de campo tem seu caso.
    for (const tag of ["input", "textarea", "select"]) {
      expect(decidirAcaoTecla(ev({ key: "d", alvoTag: tag }))).toBeNull();
      expect(decidirAcaoTecla(ev({ key: "j", alvoTag: tag }))).toBeNull();
    }
    expect(decidirAcaoTecla(ev({ key: "i", alvoEditavel: true }))).toBeNull();
  });

  it("IGNORA quando ha modificador, para nao sequestrar atalho do navegador", () => {
    expect(decidirAcaoTecla(ev({ key: "d", ctrlKey: true }))).toBeNull();
    expect(decidirAcaoTecla(ev({ key: "d", metaKey: true }))).toBeNull();
    expect(decidirAcaoTecla(ev({ key: "d", altKey: true }))).toBeNull();
  });

  it("devolve null para tecla sem acao", () => {
    expect(decidirAcaoTecla(ev({ key: "z" }))).toBeNull();
    expect(decidirAcaoTecla(ev({ key: "F5" }))).toBeNull();
  });

  it("nao diferencia maiuscula de minuscula", () => {
    expect(decidirAcaoTecla(ev({ key: "I" }))).toEqual({ tipo: "classificar", status: "interessante" });
  });
});

describe("limitarIndice", () => {
  it("mantem dentro dos limites quando a lista encolhe", () => {
    // Trocar de página ou de filtro não pode deixar a seleção apontando para
    // um item que não existe mais.
    expect(limitarIndice(9, 3)).toBe(2);
    expect(limitarIndice(-1, 3)).toBe(0);
    expect(limitarIndice(1, 3)).toBe(1);
  });

  it("lista vazia devolve -1, que significa nada selecionado", () => {
    expect(limitarIndice(0, 0)).toBe(-1);
    expect(limitarIndice(5, 0)).toBe(-1);
  });
});

describe("ATALHOS", () => {
  it("documenta toda tecla que faz alguma coisa", () => {
    // A tela de ajuda é gerada desta lista; um atalho fora dela é um atalho
    // secreto.
    expect(ATALHOS.length).toBeGreaterThanOrEqual(6);
    expect(ATALHOS.every((a) => a.tecla && a.descricao)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/teclado.test.ts`
Expected: FAIL com `Failed to resolve import "./teclado"`.

- [ ] **Step 3: Write the implementation**

Criar `src/lib/teclado.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/teclado.test.ts`
Expected: PASS, 10 testes.

- [ ] **Step 5: Verify types and the whole suite**

Run: `npx tsc --noEmit && npm test`
Expected: sem erros; suíte verde.

- [ ] **Step 6: Commit**

```bash
git add src/lib/teclado.ts src/lib/teclado.test.ts
git commit -m "feat(ux): decidir acao de teclado em funcao pura, com as regras de seguranca"
```

---

## Task 3: Chips gerados das definições

**Files:**
- Modify: `src/routes/licitacoes.index.tsx` (a construção de `chipsAtivos`, hoje por volta da linha 365)

**Interfaces:**
- Consumes: `DEFINICOES` e `DefinicaoFiltro` de `@/lib/filtros` (Task 1).
- Produces: nada para tarefas seguintes.

- [ ] **Step 1: Read what exists before touching it**

Run:
```bash
sed -n '355,430p' src/routes/licitacoes.index.tsx
```

Hoje `chipsAtivos` é montado com um `if` por filtro. Há dois chips fixos no começo — `uf-base` e `abertas` — que **não** vêm de `FiltrosLicitacoes` e devem continuar existindo: o primeiro mostra o recorte de UF vigente, o segundo lembra que a API só devolve licitação aberta.

- [ ] **Step 2: Replace the manual chain with generation**

Substituir todo o bloco que começa em `const chipsAtivos:` e vai até o último `if (filtros.…) chipsAtivos.push({…})` por:

```tsx
  // Os chips saem das definições, e não de uma cadeia de `if`. Era a cadeia que
  // deixava filtro sem chip: nove filtros existiam no backend e nenhum deles
  // aparecia aqui.
  const chipsAtivos: { chave: string; label: string; limpar?: () => void }[] = [
    { chave: "uf-base", label: filtros.uf || UF_INICIAL },
    { chave: "abertas", label: "Em aberto" },
  ];
  for (const def of DEFINICOES) {
    const valor = filtros[def.chave];
    // `uf` já aparece como chip base; repetir seria ruído.
    if (def.chave === "uf") continue;
    if (valor === "" || valor === false || valor === undefined) continue;
    chipsAtivos.push({
      chave: def.chave,
      label: def.descrever(valor),
      limpar: () => {
        if (def.chave === "palavra_chave") setTermo("");
        set(def.chave, (typeof valor === "boolean" ? false : "") as never);
      },
    });
  }
```

Acrescentar ao topo do arquivo, junto dos outros imports de `@/lib`:

```tsx
import { DEFINICOES } from "@/lib/filtros";
```

- [ ] **Step 3: Verify types, lint and the suite**

Run: `npx tsc --noEmit && npm test && npx eslint src/routes/licitacoes.index.tsx`
Expected: sem erros.

Se o `set(def.chave, …)` não tipar, **não troque o tipo de `FiltrosLicitacoes` para contornar**: o `as never` no valor é o ponto de escape deliberado, porque `set` é genérico sobre a chave e o valor varia com ela.

- [ ] **Step 4: See it in the real app**

Run: `npm run dev`
Abrir `/licitacoes`, aplicar um filtro de data e um de texto, e confirmar que cada um vira um chip com rótulo legível e que o "x" do chip limpa aquele filtro.

- [ ] **Step 5: Commit**

```bash
git add src/routes/licitacoes.index.tsx
git commit -m "refactor(ux): gerar chips de filtro ativo a partir das definicoes"
```

---

## Task 4: O painel com os nove filtros que faltavam

**Files:**
- Modify: `src/routes/licitacoes.index.tsx` (o bloco `{filtrosExpandidos && (…)}`, hoje por volta da linha 495)

**Interfaces:**
- Consumes: `definicoesDoGrupo`, `GRUPOS_ABERTOS`, `presetPrazo` de `@/lib/filtros` (Task 1).
- Produces: nada para tarefas seguintes.

- [ ] **Step 1: Read what exists**

Run:
```bash
sed -n '495,600p' src/routes/licitacoes.index.tsx
```

O painel hoje é um `grid` de três colunas com `ComboFiltro` para modalidade, UF e município, mais pares de `Input` para datas e valores. **Mantenha `ComboFiltro` como está** — ele funciona e tem comportamento de teclado próprio.

- [ ] **Step 2: Add the group state**

Logo abaixo de `const [filtrosExpandidos, setFiltrosExpandidos] = useState(false);` (ou equivalente no arquivo), acrescentar:

```tsx
  // Só "prazo" e "meu fluxo" nascem abertos: é onde a decisão de triagem
  // acontece. Abrir tudo de uma vez transforma o painel num muro de controles.
  const [gruposAbertos, setGruposAbertos] = useState<Set<string>>(
    () => new Set(GRUPOS_ABERTOS),
  );
  const alternarGrupo = (g: string) =>
    setGruposAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(g)) novo.delete(g);
      else novo.add(g);
      return novo;
    });
```

E ao import de `@/lib/filtros` acrescentar `GRUPOS_ABERTOS`, `definicoesDoGrupo` e `presetPrazo`.

- [ ] **Step 3: Add the three missing filter blocks inside the panel**

Dentro do `{filtrosExpandidos && (…)}`, **depois** dos controles que já existem, acrescentar os três blocos abaixo. Não remova nenhum controle atual.

```tsx
            {/* --- prazo da proposta: os dois filtros que o backend aceitava e
                a tela nunca ofereceu, mais os atalhos de quem pensa em
                "o que fecha essa semana" --- */}
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-muted-foreground">
                Prazo da proposta
              </Label>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <span className="mb-0.5 block text-[10px] text-muted-foreground">De</span>
                  <Input
                    type="date"
                    aria-label="Encerra a partir de"
                    value={filtros.limite_de}
                    onChange={(e) => set("limite_de", e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <span className="mb-0.5 block text-[10px] text-muted-foreground">Até</span>
                  <Input
                    type="date"
                    aria-label="Encerra até"
                    value={filtros.limite_ate}
                    onChange={(e) => set("limite_ate", e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="flex gap-1 pt-1">
                {[7, 15, 30].map((dias) => (
                  <Button
                    key={dias}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => {
                      const p = presetPrazo(dias);
                      setFiltros((f) => ({ ...f, ...p }));
                      setPagina(1);
                    }}
                  >
                    {dias} dias
                  </Button>
                ))}
              </div>
            </div>

            {/* --- documentos: "só as que têm edital" é provavelmente o filtro
                mais útil do sistema, e não existia na tela --- */}
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-muted-foreground">Documentos</Label>
              <div className="flex flex-col gap-1 pt-1">
                {definicoesDoGrupo("documentos").map((def) => (
                  <label key={def.chave} className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      className="size-3.5"
                      checked={Boolean(filtros[def.chave])}
                      onChange={(e) => set(def.chave, e.target.checked as never)}
                    />
                    {def.rotulo}
                  </label>
                ))}
              </div>
            </div>

            {/* --- meu fluxo --- */}
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-muted-foreground">Meu fluxo</Label>
              <div className="flex flex-col gap-1 pt-1">
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    className="size-3.5"
                    checked={Boolean(filtros.recomendadas)}
                    onChange={(e) => set("recomendadas", e.target.checked)}
                  />
                  Só recomendadas
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    className="size-3.5"
                    checked={Boolean(filtros.nao_analisadas)}
                    onChange={(e) => set("nao_analisadas", e.target.checked)}
                  />
                  Só não analisadas
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    className="size-3.5"
                    checked={filtros.prioridade === "sim"}
                    onChange={(e) => set("prioridade", e.target.checked ? "sim" : "")}
                  />
                  Só prioritárias
                </label>
              </div>
            </div>

            {/* --- entrada no catálogo --- */}
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-muted-foreground">
                No catálogo desde
              </Label>
              <Input
                type="date"
                aria-label="No catálogo desde"
                value={filtros.criadas_de}
                onChange={(e) => set("criadas_de", e.target.value)}
                className="h-8 text-xs"
              />
            </div>
```

**Nota sobre `gruposAbertos`:** o estado foi criado no passo 2 e ainda não é usado para recolher nada neste passo. Se, ao ver o painel no app, ele couber sem virar muro de controles, **remova `gruposAbertos` e `alternarGrupo`** em vez de deixar estado morto — e diga isso no relatório. Só mantenha o recolhimento se o painel realmente ficar longo demais.

- [ ] **Step 4: Verify types, lint and the suite**

Run: `npx tsc --noEmit && npm test && npx eslint src/routes/licitacoes.index.tsx`
Expected: sem erros.

- [ ] **Step 5: See it in the real app**

Run: `npm run dev`
Abrir `/licitacoes` e verificar, um a um: marcar "Com edital" reduz a lista; o atalho "7 dias" preenche as duas datas de prazo e a lista responde; "Só não analisadas" e "Só recomendadas" mudam o total. Cada um deve virar chip (Task 3).

- [ ] **Step 6: Commit**

```bash
git add src/routes/licitacoes.index.tsx
git commit -m "feat(ux): expor na tela os nove filtros que so existiam no backend"
```

---

## Task 5: Triagem por teclado e link da busca

**Files:**
- Create: `src/hooks/useTriagemTeclado.ts`
- Modify: `src/routes/licitacoes.index.tsx` (lista e cabeçalho)

**Interfaces:**
- Consumes: `decidirAcaoTecla`, `limitarIndice`, `ATALHOS`, `AcaoTriagem` de `@/lib/teclado` (Task 2).
- Produces: `useTriagemTeclado(opcoes: OpcoesTriagem): { indice: number; setIndice: (n: number) => void }`, com
  `interface OpcoesTriagem { tamanho: number; ativo: boolean; aoAgir: (acao: AcaoTriagem, indice: number) => void }`.

- [ ] **Step 1: Write the hook**

Criar `src/hooks/useTriagemTeclado.ts`:

```tsx
/**
 * Liga as teclas da triagem à lista.
 *
 * O fio condutor é fino de propósito: a decisão de qual ação cada tecla
 * representa, e as regras de segurança que impedem um atalho de disparar
 * enquanto alguém digita, vivem em `@/lib/teclado`, onde dá para testá-las sem
 * DOM. Se este arquivo crescer, é sinal de que há lógica no lugar errado.
 */
import { useCallback, useEffect, useState } from "react";
import { decidirAcaoTecla, limitarIndice, type AcaoTriagem } from "@/lib/teclado";

export interface OpcoesTriagem {
  tamanho: number;
  /** false desliga os atalhos — por exemplo enquanto um diálogo está aberto. */
  ativo: boolean;
  aoAgir: (acao: AcaoTriagem, indice: number) => void;
}

export function useTriagemTeclado({ tamanho, ativo, aoAgir }: OpcoesTriagem) {
  const [indice, setIndiceBruto] = useState(-1);

  // A lista muda de tamanho ao paginar ou filtrar; a seleção não pode ficar
  // apontando para um item que não existe mais.
  useEffect(() => {
    setIndiceBruto((atual) => (atual < 0 ? atual : limitarIndice(atual, tamanho)));
  }, [tamanho]);

  const setIndice = useCallback(
    (n: number) => setIndiceBruto(limitarIndice(n, tamanho)),
    [tamanho],
  );

  useEffect(() => {
    if (!ativo) return;
    function aoTeclar(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      const acao = decidirAcaoTecla({
        key: e.key,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        alvoTag: (alvo?.tagName ?? "body").toLowerCase(),
        alvoEditavel: alvo?.isContentEditable === true,
      });
      if (!acao) return;
      e.preventDefault();

      if (acao.tipo === "mover") {
        setIndiceBruto((atual) => limitarIndice((atual < 0 ? 0 : atual + acao.delta), tamanho));
        return;
      }
      setIndiceBruto((atual) => {
        aoAgir(acao, atual);
        return atual;
      });
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [ativo, tamanho, aoAgir]);

  return { indice, setIndice };
}
```

- [ ] **Step 2: Wire it into the list**

Em `src/routes/licitacoes.index.tsx`, depois de `const itens = consulta.data?.itens ?? [];`:

```tsx
  const [ajudaAberta, setAjudaAberta] = useState(false);

  // Classificar avança para o próximo: o gesto real é "essa não, próxima".
  const aoAgir = useCallback(
    (acao: AcaoTriagem, i: number) => {
      if (acao.tipo === "ajuda") return setAjudaAberta((v) => !v);
      const alvo = itens[i];
      if (!alvo) return;
      if (acao.tipo === "abrir") {
        navigate({ to: "/licitacoes/$id", params: { id: alvo.id } });
        return;
      }
      if (acao.tipo === "classificar") {
        atualizar.mutate({ id: alvo.id, statusInterno: acao.status });
        return;
      }
      if (acao.tipo === "prioridade") {
        atualizar.mutate({ id: alvo.id, prioridade: !alvo.prioridade });
      }
    },
    [itens, navigate, atualizar],
  );

  const { indice, setIndice } = useTriagemTeclado({
    tamanho: itens.length,
    ativo: !ajudaAberta,
    aoAgir,
  });
```

Imports a acrescentar: `useCallback` de `react`, `useTriagemTeclado` de `@/hooks/useTriagemTeclado`, `ATALHOS` e `type AcaoTriagem` de `@/lib/teclado`.

A assinatura foi conferida em `src/services/api.ts`: `AtualizacaoInterna` tem
`{ id: string; statusInterno?: StatusInterno; prioridade?: boolean; observacoes?: string; historico?: string }`.
Repare que o campo é **`statusInterno`** em camelCase, e não `status_interno` —
o nome snake_case só existe no banco.

- [ ] **Step 3: Show the selection in the table**

Na `<tr>` de cada item (hoje por volta da linha 653), acrescentar ao `className` e aos atributos:

```tsx
                      aria-selected={i === indice}
                      onMouseEnter={() => setIndice(i)}
                      className={cn(
                        "cursor-pointer border-b border-border/60 align-middle transition-colors last:border-0 hover:bg-accent/40",
                        i === indice && "bg-accent/60 ring-1 ring-inset ring-primary/40",
                      )}
```

Para isso o `map` precisa do índice: trocar `{itens.map((l) => {` por `{itens.map((l, i) => {`.

Acrescentar `role="grid"` à `<table>`, para que a navegação seja anunciada por leitor de tela.

- [ ] **Step 4: Add the shortcut help and the copy-link button**

No cabeçalho da seção de resultados, ao lado da contagem, acrescentar:

```tsx
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={() => setAjudaAberta((v) => !v)}
        >
          Atalhos (?)
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={() => {
            // A URL não é espelho dos filtros — decisão registrada no topo
            // deste arquivo. Quem quiser compartilhar, compartilha por aqui,
            // sem poluir o histórico do navegador a cada tecla.
            const params = new URLSearchParams();
            for (const [k, v] of Object.entries(filtros)) {
              if (v === "" || v === false || v === undefined) continue;
              params.set(k, String(v));
            }
            const url = `${window.location.origin}/licitacoes?${params.toString()}`;
            void navigator.clipboard.writeText(url);
            toast.success("Link desta busca copiado");
          }}
        >
          Copiar link
        </Button>
```

E, quando `ajudaAberta`, uma lista simples dos atalhos:

```tsx
      {ajudaAberta && (
        <div className="mt-3 rounded-lg border border-border bg-card p-3">
          <p className="mb-2 text-[11px] font-medium">Atalhos de triagem</p>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-muted-foreground">
            {ATALHOS.map((a) => (
              <li key={a.tecla} className="flex justify-between">
                <kbd className="rounded border border-border px-1">{a.tecla}</kbd>
                <span>{a.descricao}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
```

- [ ] **Step 5: Verify types, lint and the suite**

Run: `npx tsc --noEmit && npm test && npx eslint src/routes/licitacoes.index.tsx src/hooks/useTriagemTeclado.ts`
Expected: sem erros.

- [ ] **Step 6: See it in the real app — this is the step that matters**

Run: `npm run dev`

Verificar, nesta ordem:

1. `j` e `k` movem o destaque pela lista.
2. **Clicar no campo de busca, digitar "edital", e confirmar que NENHUMA licitação foi descartada.** É a regra que o teste cobre e o motivo de ela existir.
3. `i` marca interessante e o destaque avança.
4. `Enter` abre a licitação destacada.
5. `?` abre e fecha a ajuda, e com ela aberta os atalhos não disparam.
6. "Copiar link" põe no clipboard uma URL com os filtros ativos.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useTriagemTeclado.ts src/routes/licitacoes.index.tsx
git commit -m "feat(ux): triagem por teclado na lista e link compartilhavel da busca"
```

---

## Self-Review

**1. Cobertura da spec.** §3[A] `filtros.ts` → Task 1. §3[B] `teclado.ts` + hook → Tasks 2 e 5. §3[C] chips e link → Tasks 3 e 5. §5 testes → Tasks 1 e 2 (as duas unidades puras), com a tela verificada por execução real, como a spec determina. §2 (o que não mexer) → constraint global e Step 1 das Tasks 3 e 4, que mandam ler antes de tocar.

**2. Varredura de placeholders.** Nenhum "TBD" ou "implementar depois". Os dois pontos em que o plano manda o executor decidir são deliberados e têm critério escrito: remover `gruposAbertos` se o painel couber (Task 4 Step 3) e confirmar a assinatura de `atualizar.mutate` no código real (Task 5 Step 2). Ambos pedem que a decisão vá para o relatório.

**3. Consistência de tipos.** `DefinicaoFiltro.chave` é `keyof FiltrosLicitacoes` na Task 1 e é assim que a Task 3 a usa em `filtros[def.chave]`. `AcaoTriagem` sai da Task 2 e entra na Task 5 sem renomear. `limitarIndice` devolve `-1` para lista vazia, e o hook da Task 5 trata `indice < 0` como "nada selecionado" em todos os caminhos. `presetPrazo` devolve exatamente as chaves `limite_de`/`limite_ate`, que é o que o espalhamento da Task 4 espera.
