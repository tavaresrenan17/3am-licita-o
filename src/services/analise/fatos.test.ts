import { describe, expect, it } from "vitest";
import type { ItemLicitacao } from "@/lib/types";
import { calcularFatosPncp } from "./fatos";

const agora = new Date("2026-09-24T12:00:00-03:00");

const item = (parcial: Partial<ItemLicitacao> = {}): ItemLicitacao => ({
  numeroItem: 1,
  descricao: "Lajão britado",
  valorUnitarioEstimado: 100,
  valorTotal: 1_000,
  quantidade: 10,
  unidadeMedida: "t",
  tipoBeneficioNome: "Sem benefício",
  situacaoCompraItemNome: "Em andamento",
  temResultado: false,
  ...parcial,
});

const aberta = { situacao_compra_id: 1, data_encerramento_proposta: "2026-10-01T09:00:00" };

describe("fatos do certame calculados pelo sistema", () => {
  it("soma os itens e conta os que têm exclusividade ou cota para ME/EPP", () => {
    const fatos = calcularFatosPncp(
      aberta,
      [
        item({ valorTotal: 1_000, tipoBeneficioNome: "Participação exclusiva para ME/EPP" }),
        item({
          numeroItem: 2,
          valorTotal: 2_500.5,
          tipoBeneficioNome: "Cota reservada para ME/EPP",
        }),
        item({ numeroItem: 3, valorTotal: 300, tipoBeneficioNome: "Não se aplica" }),
      ],
      agora,
    );

    expect(fatos).toMatchObject({
      itensDisponiveis: true,
      totalItens: 3,
      valorTotalItens: 3_800.5,
      itensMeEpp: 2,
      situacoesItens: { "Em andamento": 3 },
      situacaoCertame: "aberto",
    });
  });

  it.each([
    [2, "revogado"],
    [3, "anulado"],
    [4, "suspenso"],
  ] as const)("situação %i do PNCP vira %s, acima de qualquer outra regra", (id, esperado) => {
    const fatos = calcularFatosPncp({ ...aberta, situacao_compra_id: id }, [item()], agora);
    expect(fatos.situacaoCertame).toBe(esperado);
  });

  it("todos os itens com resultado no PNCP: certame homologado", () => {
    // Credenciamento de Pompéia, 24/09/2026: os 10 itens já "Homologado".
    const fatos = calcularFatosPncp(
      aberta,
      [
        item({ situacaoCompraItemNome: "Homologado", temResultado: true }),
        item({ numeroItem: 2, situacaoCompraItemNome: "Homologado", temResultado: true }),
      ],
      agora,
    );
    expect(fatos.situacaoCertame).toBe("homologado");
    expect(fatos.motivoSituacao).toContain("2 itens");
  });

  it("um item ainda sem resultado impede a marcação de homologado", () => {
    const fatos = calcularFatosPncp(
      aberta,
      [item({ situacaoCompraItemNome: "Homologado", temResultado: true }), item({ numeroItem: 2 })],
      agora,
    );
    expect(fatos.situacaoCertame).toBe("aberto");
  });

  it("prazo de proposta vencido: proposta encerrada", () => {
    const fatos = calcularFatosPncp(
      { ...aberta, data_encerramento_proposta: "2026-09-20T09:00:00" },
      [item()],
      agora,
    );
    expect(fatos.situacaoCertame).toBe("proposta_encerrada");
  });

  it("sem data de encerramento e sem outro sinal: indeterminado", () => {
    const fatos = calcularFatosPncp(
      { situacao_compra_id: 1, data_encerramento_proposta: null },
      [item()],
      agora,
    );
    expect(fatos.situacaoCertame).toBe("indeterminado");
  });

  it("itens indisponíveis no PNCP: não afirma nada sobre eles", () => {
    const fatos = calcularFatosPncp(aberta, null, agora);
    expect(fatos).toMatchObject({
      itensDisponiveis: false,
      totalItens: 0,
      valorTotalItens: 0,
      situacaoCertame: "aberto",
    });
  });
});
