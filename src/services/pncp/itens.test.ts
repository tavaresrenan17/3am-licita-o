import { describe, expect, it } from "vitest";
import { identificarCompraPncp, mapearItemPncp } from "./itens";

describe("mapeamento de item do PNCP", () => {
  it("converte os campos numéricos e textuais de um item completo", () => {
    const item = mapearItemPncp({
      numeroItem: 3,
      descricao: "  CONSULTA ESPECIALIDADE - CARDIOLOGIA ",
      quantidade: 7101,
      unidadeMedida: "SERVIÇO",
      valorUnitarioEstimado: 150,
      valorTotal: 1065150,
      tipoBeneficio: 5,
      tipoBeneficioNome: "Não se aplica",
      situacaoCompraItem: 4,
      situacaoCompraItemNome: "Homologado",
      temResultado: true,
      orcamentoSigiloso: false,
    });

    expect(item).toMatchObject({
      numeroItem: 3,
      descricao: "CONSULTA ESPECIALIDADE - CARDIOLOGIA",
      quantidade: 7101,
      unidadeMedida: "SERVIÇO",
      valorUnitarioEstimado: 150,
      valorTotal: 1065150,
      tipoBeneficioNome: "Não se aplica",
      situacaoCompraItemNome: "Homologado",
      temResultado: true,
      orcamentoSigiloso: false,
    });
  });

  it("não inventa valores quando o PNCP omite campos", () => {
    const item = mapearItemPncp({ numeroItem: 1, descricao: "Brita" });

    expect(item).toMatchObject({
      unidadeMedida: "un",
      quantidade: 0,
      valorTotal: 0,
      tipoBeneficioNome: null,
      situacaoCompraItemNome: null,
      temResultado: false,
    });
  });
});

describe("identificação da compra no PNCP", () => {
  it("tira a pontuação do CNPJ e completa com zeros", () => {
    expect(
      identificarCompraPncp({
        cnpj_orgao: "1.234.567/0001-89",
        ano_compra: 2026,
        sequencial_compra: "52",
      }),
    ).toEqual({ cnpj: "01234567000189", ano: 2026, sequencial: 52 });
  });

  it("devolve nulo quando falta algum identificador", () => {
    expect(identificarCompraPncp({ cnpj_orgao: "12345678000190", ano_compra: 2026 })).toBeNull();
  });
});
