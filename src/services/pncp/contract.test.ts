import { describe, expect, it } from "vitest";
import { ParametroInvalidoError, montarQuery, montarUrl } from "./contract";

const q = (e: Parameters<typeof montarQuery>[0], p: Parameters<typeof montarQuery>[1]) =>
  Object.fromEntries(montarQuery(e, p));

describe("C01/C02 — obrigatoriedade e limites por endpoint", () => {
  it("aceita proposta sem modalidade (verificado em produção, sondagem E01)", () => {
    expect(q("proposta", { dataFinal: "20261011", uf: "DF", pagina: 1 })).toEqual({
      dataFinal: "20261011",
      uf: "DF",
      pagina: "1",
      tamanhoPagina: "50",
    });
  });

  it("exige modalidade em publicação e em atualização (sondagem E03)", () => {
    expect(() =>
      montarQuery("publicacao", { dataInicial: "20260910", dataFinal: "20260910", pagina: 1 }),
    ).toThrow(ParametroInvalidoError);
    expect(() =>
      montarQuery("atualizacao", { dataInicial: "20260910", dataFinal: "20260910", pagina: 1 }),
    ).toThrow(/codigoModalidadeContratacao/);
  });

  it("exige dataFinal em proposta e as duas datas nas demais", () => {
    expect(() => montarQuery("proposta", { pagina: 1 })).toThrow(/dataFinal/);
    expect(() =>
      montarQuery("publicacao", {
        dataFinal: "20260910",
        codigoModalidadeContratacao: 6,
        pagina: 1,
      }),
    ).toThrow(/dataInicial/);
  });

  it("rejeita tamanhoPagina fora de 10–50 (51 foi recusado com 400 na sondagem E02)", () => {
    expect(() =>
      montarQuery("proposta", { dataFinal: "20261011", pagina: 1, tamanhoPagina: 51 }),
    ).toThrow(/tamanhoPagina/);
    expect(() =>
      montarQuery("proposta", { dataFinal: "20261011", pagina: 1, tamanhoPagina: 9 }),
    ).toThrow(/tamanhoPagina/);
    expect(q("proposta", { dataFinal: "20261011", pagina: 1, tamanhoPagina: 10 })).toMatchObject({
      tamanhoPagina: "10",
    });
    expect(q("proposta", { dataFinal: "20261011", pagina: 1, tamanhoPagina: 50 })).toMatchObject({
      tamanhoPagina: "50",
    });
  });

  it("página começa em 1", () => {
    expect(() => montarQuery("proposta", { dataFinal: "20261011", pagina: 0 })).toThrow(/pagina/);
  });
});

describe("C03 — parâmetros que não pertencem ao endpoint", () => {
  it("recusa dataInicial e codigoModoDisputa em proposta", () => {
    expect(() =>
      montarQuery("proposta", { dataInicial: "20260901", dataFinal: "20261011", pagina: 1 }),
    ).toThrow(/dataInicial/);
    expect(() =>
      montarQuery("proposta", { dataFinal: "20261011", codigoModoDisputa: 3, pagina: 1 }),
    ).toThrow(/codigoModoDisputa/);
  });

  it("recusa filtros inventados de texto, preço e ordenação", () => {
    for (const extra of [
      { palavraChave: "obra" },
      { valorMinimo: 1000 },
      { status: "aberta" },
      { sort: "data" },
      { limit: 100 },
    ]) {
      expect(() =>
        montarQuery("proposta", {
          dataFinal: "20261011",
          pagina: 1,
          ...(extra as object),
        }),
      ).toThrow(ParametroInvalidoError);
    }
  });

  it("aceita codigoModoDisputa em publicação e atualização", () => {
    expect(
      q("publicacao", {
        dataInicial: "20260901",
        dataFinal: "20260907",
        codigoModalidadeContratacao: 6,
        codigoModoDisputa: 3,
        pagina: 1,
      }),
    ).toMatchObject({ codigoModoDisputa: "3" });
  });
});

describe("C07 — validação de datas e identificadores", () => {
  it("rejeita data fora do calendário e formato errado", () => {
    expect(() => montarQuery("proposta", { dataFinal: "20260230", pagina: 1 })).toThrow(
      /calendário/,
    );
    expect(() => montarQuery("proposta", { dataFinal: "2026-10-11", pagina: 1 })).toThrow(
      /AAAAMMDD/,
    );
  });

  it("rejeita início posterior ao fim", () => {
    expect(() =>
      montarQuery("publicacao", {
        dataInicial: "20260908",
        dataFinal: "20260901",
        codigoModalidadeContratacao: 6,
        pagina: 1,
      }),
    ).toThrow(/posterior/);
  });

  it("exige UF em maiúsculas e IBGE com 7 dígitos", () => {
    expect(() => montarQuery("proposta", { dataFinal: "20261011", uf: "sp", pagina: 1 })).toThrow(
      /uf/,
    );
    expect(() =>
      montarQuery("proposta", { dataFinal: "20261011", codigoMunicipioIbge: "3550", pagina: 1 }),
    ).toThrow(/codigoMunicipioIbge/);
  });

  it("preserva CNPJ como texto, inclusive alfanumérico, e recusa pontuação", () => {
    expect(
      q("proposta", { dataFinal: "20261011", cnpj: "26989715000102", pagina: 1 }),
    ).toMatchObject({ cnpj: "26989715000102" });
    expect(
      q("proposta", { dataFinal: "20261011", cnpj: "12ABC34501DE35", pagina: 1 }),
    ).toMatchObject({ cnpj: "12ABC34501DE35" });
    expect(() =>
      montarQuery("proposta", { dataFinal: "20261011", cnpj: "26.989.715/0001-02", pagina: 1 }),
    ).toThrow(/cnpj/);
  });
});

describe("montarUrl", () => {
  it("reproduz o exemplo do arquivo 02 §8", () => {
    expect(
      montarUrl("proposta", {
        dataFinal: "20261011",
        uf: "SP",
        codigoModalidadeContratacao: 6,
        pagina: 1,
        tamanhoPagina: 50,
      }),
    ).toBe(
      "https://pncp.gov.br/api/consulta/v1/contratacoes/proposta?dataFinal=20261011&codigoModalidadeContratacao=6&uf=SP&pagina=1&tamanhoPagina=50",
    );
  });
});
