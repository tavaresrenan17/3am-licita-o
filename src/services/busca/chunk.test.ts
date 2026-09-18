import { describe, expect, it } from "vitest";
import { dividirEmChunks, MAX_CHUNKS_DOC, SOBREPOSICAO, TAMANHO_CHUNK } from "./chunk";

const texto = (n: number) => "a".repeat(n);

describe("dividirEmChunks", () => {
  it("texto menor que o chunk vira um chunk só", () => {
    expect(dividirEmChunks("edital curto")).toEqual(["edital curto"]);
  });

  it("texto vazio não vira chunk nenhum", () => {
    expect(dividirEmChunks("   ")).toEqual([]);
  });

  it("respeita tamanho e sobreposição", () => {
    const chunks = dividirEmChunks(texto(3000), { tamanho: 1000, sobreposicao: 200 });
    expect(chunks[0]).toHaveLength(1000);
    // O segundo começa 800 chars adiante: 1000 - 200 de sobreposição.
    expect(chunks.length).toBe(Math.ceil((3000 - 200) / 800));
  });

  it("corta no limite de palavra quando há espaço perto do fim", () => {
    const frase = "pavimentacao asfaltica de vias urbanas no municipio de Lins ".repeat(60);
    const chunks = dividirEmChunks(frase, { tamanho: 100, sobreposicao: 10 });
    for (const c of chunks.slice(0, -1)) {
      expect(c.endsWith(" ")).toBe(false);
      expect(c.trim()).toBe(c);
    }
  });

  it("obedece ao teto de chunks por documento", () => {
    const chunks = dividirEmChunks(texto(500_000), {
      tamanho: 1000,
      sobreposicao: 100,
      maxChunks: 5,
    });
    expect(chunks).toHaveLength(5);
  });

  it("os padrões são os da spec", () => {
    expect(TAMANHO_CHUNK).toBe(1500);
    expect(SOBREPOSICAO).toBe(200);
    expect(MAX_CHUNKS_DOC).toBe(40);
  });

  it("sobreposição maior que o tamanho não trava em laço infinito", () => {
    const chunks = dividirEmChunks(texto(5000), { tamanho: 100, sobreposicao: 500 });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.length).toBeLessThan(200);
  });
});
