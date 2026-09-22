import { describe, expect, it } from "vitest";
import { ORIGEM_PADRAO, ORIGENS_PREDEFINIDAS } from "./cidades";
import { formatarDistanciaKm, obterFaixaProximidade } from "./haversine";

describe("Origens do filtro por raio", () => {
  it("usa códigos IBGE de 7 dígitos, sem repetição", () => {
    const ids = ORIGENS_PREDEFINIDAS.map((o) => o.id);
    for (const id of ids) expect(id).toMatch(/^\d{7}$/);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("tem a sede como padrão, com o código IBGE real dela", () => {
    // 3549805 é São José do Rio Preto; a sede já esteve cadastrada com ele.
    expect(ORIGEM_PADRAO).toMatchObject({ id: "3546405", nome: "Santa Cruz do Rio Pardo" });
    expect(ORIGENS_PREDEFINIDAS.find((o) => o.id === "3549805")?.nome).toBe(
      "São José do Rio Preto",
    );
  });
});

describe("Apresentação da distância", () => {
  it("classifica faixa de proximidade corretamente", () => {
    expect(obterFaixaProximidade(45)).toBe("muito_perto");
    expect(obterFaixaProximidade(100)).toBe("muito_perto");
    expect(obterFaixaProximidade(150)).toBe("media");
    expect(obterFaixaProximidade(250)).toBe("media");
    expect(obterFaixaProximidade(350)).toBe("longe");
    expect(obterFaixaProximidade(null)).toBe("desconhecido");
  });

  it("formata a distância em padrão pt-BR", () => {
    expect(formatarDistanciaKm(45.2)).toBe("45,2 km");
    expect(formatarDistanciaKm(null)).toBe("—");
  });
});
