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
    expect(decidirAcaoTecla(ev({ key: "i" }))).toEqual({
      tipo: "classificar",
      status: "interessante",
    });
    expect(decidirAcaoTecla(ev({ key: "a" }))).toEqual({
      tipo: "classificar",
      status: "em_analise",
    });
    expect(decidirAcaoTecla(ev({ key: "d" }))).toEqual({
      tipo: "classificar",
      status: "descartada",
    });
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
    expect(decidirAcaoTecla(ev({ key: "I" }))).toEqual({
      tipo: "classificar",
      status: "interessante",
    });
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
  it("documenta correspondência perfeita entre teclas e descricoes", () => {
    // A tela de ajuda é gerada desta lista. Qualquer atalho no switch sem
    // entrada em ATALHOS vira secreto. Qualquer entrada sem correspondência
    // vira documentação mentirosa. O teste garante correspondência 1:1.
    //
    // Entradas como "j / ↓" representam duas teclas. Precisamos expandir e
    // verificar que cada uma dispara uma ação, mapeando símbolos visuais
    // (↓, ↑) para seus nomes de tecla (ArrowDown, ArrowUp).
    const teclasCadastradas = new Set<string>();
    const mapearSimbolo = (s: string): string => {
      if (s === "↓") return "ArrowDown";
      if (s === "↑") return "ArrowUp";
      return s;
    };

    for (const a of ATALHOS) {
      const partes = a.tecla.split("/").map((p) => p.trim());
      for (const p of partes) {
        teclasCadastradas.add(mapearSimbolo(p));
      }
    }

    // Toda tecla que dispara uma ação deve estar documentada
    const taclasQueDisparam = ["j", "ArrowDown", "k", "ArrowUp", "Enter", "i", "a", "d", "p", "?"];
    for (const t of taclasQueDisparam) {
      expect(teclasCadastradas.has(t)).toBe(true);
    }

    // Toda tecla documentada deve disparar uma ação (não deve haver entradas
    // fantasmas)
    for (const t of teclasCadastradas) {
      const resultado = decidirAcaoTecla(ev({ key: t }));
      expect(resultado).not.toBeNull();
    }
  });
});
