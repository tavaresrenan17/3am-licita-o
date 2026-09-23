import { describe, expect, it } from "vitest";
import {
  montarPrompt,
  parsearDadosAdicionais,
  selecionarTrechos,
  TETO_CARACTERES,
} from "./extracao";

const edital = [
  "PREFEITURA MUNICIPAL DE ALMEIRIM - PA. PREGÃO ELETRÔNICO Nº 12/2026.",
  "x".repeat(5000),
  "O prazo de entrega será de 5 (cinco) dias corridos contados da ordem de fornecimento.",
  "y".repeat(5000),
  "A validade da proposta não será inferior a 60 dias. Contato: cpl.almeirim@gmail.com",
  "z".repeat(5000),
].join(" ");

describe("selecionarTrechos", () => {
  it("leva preâmbulo e arredores das âncoras, não o documento inteiro", () => {
    const t = selecionarTrechos([{ nome: "edital.pdf", tipo: "edital", texto: edital }]);
    expect(t).toContain("PREFEITURA MUNICIPAL DE ALMEIRIM");
    expect(t).toContain("prazo de entrega será de 5");
    expect(t).toContain("cpl.almeirim@gmail.com");
    expect(t.length).toBeLessThan(edital.length);
  });

  it("põe o edital antes dos anexos", () => {
    const t = selecionarTrechos([
      { nome: "anexo.pdf", tipo: "anexo", texto: "Anexo com endereço de entrega." },
      { nome: "edital.pdf", tipo: "edital", texto: "Edital com pregoeiro João." },
    ]);
    expect(t.indexOf("edital.pdf")).toBeLessThan(t.indexOf("anexo.pdf"));
  });

  it("respeita o teto de caracteres", () => {
    const enorme = Array.from(
      { length: 400 },
      (_, i) => `prazo de entrega ${i} ${"w".repeat(900)}`,
    ).join(" ");
    const t = selecionarTrechos([{ nome: "e.pdf", tipo: "edital", texto: enorme }]);
    expect(t.length).toBeLessThanOrEqual(TETO_CARACTERES + 200);
  });

  it("devolve vazio sem documentos", () => {
    expect(selecionarTrechos([])).toBe("");
  });
});

describe("parsearDadosAdicionais", () => {
  it("aceita a resposta completa", () => {
    const d = parsearDadosAdicionais(
      JSON.stringify({
        prazoEntrega: "5 dias",
        prazoPagamento: "30 dias",
        validadeProposta: "60 dias",
        pregoeiro: null,
        telefone: null,
        email: "cpl.almeirim@gmail.com",
        enderecos: [{ tipo: "Entrega", endereco: "Prefeitura Municipal de Almeirim - PA" }],
      }),
    );
    expect(d.prazoEntrega).toBe("5 dias");
    expect(d.pregoeiro).toBeNull();
    expect(d.enderecos).toHaveLength(1);
  });

  it("normaliza marcadores de ausência e campos faltantes", () => {
    const d = parsearDadosAdicionais(JSON.stringify({ prazoEntrega: "---", telefone: "N/A" }));
    expect(d.prazoEntrega).toBeNull();
    expect(d.telefone).toBeNull();
    expect(d.enderecos).toEqual([]);
  });

  it("recusa texto que não é JSON", () => {
    expect(() => parsearDadosAdicionais("não sei")).toThrow(/JSON/);
  });
});

describe("montarPrompt", () => {
  it("inclui as chaves esperadas e os trechos", () => {
    const p = montarPrompt("TRECHO-X");
    expect(p).toContain("prazoEntrega");
    expect(p).toContain("enderecos");
    expect(p).toContain("TRECHO-X");
  });
});
