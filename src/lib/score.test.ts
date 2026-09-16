/**
 * Score de aderência. O foco aqui é o que a fórmula promete ao usuário: quem
 * decide o que a equipe vê não pode depender de detalhe ortográfico nem tratar
 * ausência de dado como informação.
 */
import { describe, expect, it } from "vitest";
import { calcularScore } from "./score";

const cfg = {
  palavras_chave: ["obra", "construção", "pavimentação"],
  score_peso_palavras: 45,
  score_peso_documentos: 30,
  score_peso_valor: 17,
};

const base = {
  objeto: "",
  modalidade: "Pregão - Eletrônico",
  valor_estimado: 500_000,
  categoria: "Obra nova",
  documentos: [] as { tipo_documento: "edital" | "projeto" | "orcamento" | "anexo" | "outro" }[],
};

describe("palavras-chave e acentuação", () => {
  it("casa o objeto escrito SEM acento com a palavra-chave acentuada", () => {
    // Grafia comum em texto de órgão público; antes da normalização esta
    // licitação perdia 45 pontos por um detalhe ortográfico.
    const comAcento = calcularScore({ ...base, objeto: "CONSTRUÇÃO DE ESCOLA MUNICIPAL" }, cfg);
    const semAcento = calcularScore({ ...base, objeto: "CONSTRUCAO DE ESCOLA MUNICIPAL" }, cfg);
    expect(semAcento).toBe(comAcento);
  });

  it("casa a palavra-chave sem acento com o objeto acentuado", () => {
    const a = calcularScore(
      { ...base, objeto: "Serviço de pavimentação asfáltica" },
      { ...cfg, palavras_chave: ["pavimentacao"] },
    );
    const b = calcularScore(
      { ...base, objeto: "Serviço de pavimentação asfáltica" },
      { ...cfg, palavras_chave: ["pavimentação"] },
    );
    expect(a).toBe(b);
  });

  it("satura em três termos: o quarto não acrescenta", () => {
    const tres = calcularScore({ ...base, objeto: "obra de construção e pavimentação" }, cfg);
    const quatro = calcularScore(
      { ...base, objeto: "obra de construção e pavimentação" },
      { ...cfg, palavras_chave: [...cfg.palavras_chave, "escola"] },
    );
    expect(quatro).toBe(tres);
  });

  it("objeto sem nenhum termo não ganha pontos de palavra", () => {
    const comTermo = calcularScore({ ...base, objeto: "obra" }, cfg);
    const semTermo = calcularScore({ ...base, objeto: "aquisição de material de escritório" }, cfg);
    expect(comTermo - semTermo).toBe(15); // 1 de 3 termos = 1/3 de 45
  });
});

describe("valor desconhecido não é valor baixo", () => {
  it("valor nulo recebe a faixa mínima, e não zero", () => {
    // Orçamento sigiloso é ausência de informação; tratá-lo como "barato"
    // distorceria a priorização (arquivo 08 §4).
    const nulo = calcularScore({ ...base, objeto: "obra", valor_estimado: null }, cfg);
    const baixo = calcularScore({ ...base, objeto: "obra", valor_estimado: 50_000 }, cfg);
    expect(nulo).toBe(baixo);
  });

  it("valor alto pontua mais que valor baixo", () => {
    const alto = calcularScore({ ...base, objeto: "obra", valor_estimado: 2_000_000 }, cfg);
    const baixo = calcularScore({ ...base, objeto: "obra", valor_estimado: 50_000 }, cfg);
    expect(alto).toBeGreaterThan(baixo);
  });
});

describe("documentos", () => {
  it("projeto e orçamento pesam mais que edital sozinho", () => {
    const soEdital = calcularScore(
      { ...base, objeto: "obra", documentos: [{ tipo_documento: "edital" }] },
      cfg,
    );
    const completo = calcularScore(
      {
        ...base,
        objeto: "obra",
        documentos: [
          { tipo_documento: "edital" },
          { tipo_documento: "projeto" },
          { tipo_documento: "orcamento" },
        ],
      },
      cfg,
    );
    expect(completo).toBeGreaterThan(soEdital);
  });
});

describe("limites", () => {
  it("nunca passa de 100 nem fica abaixo de 0", () => {
    const max = calcularScore(
      {
        objeto: "obra de construção e pavimentação",
        modalidade: "Concorrência",
        valor_estimado: 10_000_000,
        categoria: "Obra nova",
        documentos: [
          { tipo_documento: "edital" },
          { tipo_documento: "projeto" },
          { tipo_documento: "orcamento" },
        ],
      },
      { ...cfg, score_peso_palavras: 100, score_peso_documentos: 100, score_peso_valor: 100 },
    );
    expect(max).toBeLessThanOrEqual(100);
    expect(max).toBeGreaterThanOrEqual(0);
  });
});
