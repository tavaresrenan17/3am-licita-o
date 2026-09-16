import { describe, expect, it } from "vitest";
import { classificarCategoria } from "./categoria";

describe("classificação de categoria pelo objeto", () => {
  it("reconhece as famílias de obra com acentuação real do PNCP", () => {
    expect(
      classificarCategoria("Execução de obra de pavimentação asfáltica em vias urbanas"),
    ).toBe("Pavimentação");
    expect(classificarCategoria("Obra de drenagem pluvial e contenção de encostas")).toBe(
      "Drenagem",
    );
    expect(classificarCategoria("Urbanização de orla e construção de calçadão")).toBe(
      "Infraestrutura urbana",
    );
    expect(
      classificarCategoria("Serviços de manutenção predial preventiva em prédios administrativos"),
    ).toBe("Manutenção predial");
    expect(
      classificarCategoria("Elaboração de projeto executivo de creche municipal"),
    ).toBe("Serviços de engenharia");
    expect(classificarCategoria("Reforma e ampliação de unidade básica de saúde")).toBe("Reforma");
    expect(
      classificarCategoria("Contratação de empresa para construção de escola municipal"),
    ).toBe("Obra nova");
  });

  it("a regra mais específica vence a genérica", () => {
    expect(classificarCategoria("Reforma com recapeamento asfáltico de pátio")).toBe(
      "Pavimentação",
    );
  });

  it("objeto fora do setor cai em Outros, sem descartar o registro", () => {
    expect(classificarCategoria("Aquisição de material de escritório e informática")).toBe(
      "Outros",
    );
    expect(classificarCategoria("")).toBe("Outros");
  });

  it("ignora diferença de caixa e de acento", () => {
    expect(classificarCategoria("PAVIMENTAÇÃO DE VIAS")).toBe("Pavimentação");
    expect(classificarCategoria("pavimentacao de vias")).toBe("Pavimentação");
  });
});
