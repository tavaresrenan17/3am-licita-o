import { describe, expect, it } from "vitest";
import { avaliarDensidade, DENSIDADE_MINIMA, normalizarTexto } from "./texto";

describe("avaliarDensidade", () => {
  it("densidade alta é texto de verdade", () => {
    expect(avaliarDensidade(103_602, 38)).toBe("extraido"); // medição real: 2726 chars/pág
  });

  it("densidade baixa é PDF escaneado", () => {
    expect(avaliarDensidade(500, 40)).toBe("sem_texto"); // 12 chars/pág
  });

  it("zero páginas não divide por zero", () => {
    expect(avaliarDensidade(1000, 0)).toBe("sem_texto");
  });

  it("o limiar é exatamente 200 e é inclusivo para cima", () => {
    expect(avaliarDensidade(DENSIDADE_MINIMA * 10, 10)).toBe("extraido");
    expect(avaliarDensidade(DENSIDADE_MINIMA * 10 - 1, 10)).toBe("sem_texto");
  });
});

describe("normalizarTexto", () => {
  it("colapsa espaço em branco sem comer acento", () => {
    expect(normalizarTexto("  PREGÃO   ELETRÔNICO \n\n Nº 1 ")).toBe("PREGÃO ELETRÔNICO Nº 1");
  });

  it("remove o caractere nulo, que o Postgres recusa em text", () => {
    expect(normalizarTexto("a\0b")).toBe("ab");
  });
});
