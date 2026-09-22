import { describe, expect, it } from "vitest";
import { normalizarNomeCidade, obterCoordenadasMunicipio, ORIGENS_PREDEFINIDAS } from "./cidades";
import {
  calcularDistanciaHaversine,
  calcularDistanciaLicitacao,
  filtrarLicitaçõesPorRaio,
  formatarDistanciaKm,
  obterFaixaProximidade,
} from "./haversine";

describe("Geolocalização e Cálculo Haversine", () => {
  it("normaliza nomes de cidades removendo acentos e pontuações", () => {
    expect(normalizarNomeCidade("Santa Cruz do Rio Pardo")).toBe("santa cruz do rio pardo");
    expect(normalizarNomeCidade("SÃO PAULO")).toBe("sao paulo");
    expect(normalizarNomeCidade("  Marília - SP  ")).toBe("marilia sp");
    expect(normalizarNomeCidade("Águas de Lindóia")).toBe("aguas de lindoia");
  });

  it("encontra coordenadas de cidades conhecidas com e sem UF", () => {
    const sc = obterCoordenadasMunicipio("Santa Cruz do Rio Pardo", "SP");
    expect(sc).not.toBeNull();
    expect(sc?.lat).toBeCloseTo(-22.8989, 3);
    expect(sc?.lon).toBeCloseTo(-49.6339, 3);

    const ourinhos = obterCoordenadasMunicipio("ourinhos");
    expect(ourinhos).not.toBeNull();
    expect(ourinhos?.lat).toBeCloseTo(-22.9786, 3);
  });

  it("calcula a distância Haversine aproximada entre cidades conhecidas", () => {
    const santaCruz = { lat: -22.8989, lon: -49.6339 };
    const ourinhos = { lat: -22.9786, lon: -49.8706 };
    const bauru = { lat: -22.3147, lon: -49.0606 };
    const saoPaulo = { lat: -23.5505, lon: -46.6333 };

    const distOurinhos = calcularDistanciaHaversine(santaCruz, ourinhos);
    // Santa Cruz a Ourinhos em linha reta é cerca de 26-28 km
    expect(distOurinhos).toBeGreaterThan(20);
    expect(distOurinhos).toBeLessThan(35);

    const distBauru = calcularDistanciaHaversine(santaCruz, bauru);
    // Santa Cruz a Bauru é cerca de 86 km
    expect(distBauru).toBeGreaterThan(70);
    expect(distBauru).toBeLessThan(100);

    const distSp = calcularDistanciaHaversine(santaCruz, saoPaulo);
    // Santa Cruz a SP é cerca de 310-320 km
    expect(distSp).toBeGreaterThan(290);
    expect(distSp).toBeLessThan(340);
  });

  it("calcula a distância de um item de licitação", () => {
    const sede = ORIGENS_PREDEFINIDAS[0]; // Santa Cruz do Rio Pardo
    const licitacaoOurinhos = { municipio: "Ourinhos", uf: "SP" };
    const dist = calcularDistanciaLicitacao(sede, licitacaoOurinhos);
    expect(dist).not.toBeNull();
    expect(dist).toBeCloseTo(25.8, 0);

    const licitacaoDesconhecida = { municipio: "Cidade Inexistente 99", uf: "XX" };
    expect(calcularDistanciaLicitacao(sede, licitacaoDesconhecida)).toBeNull();
  });

  it("filtra itens pelo raio especificado em km", () => {
    const sede = ORIGENS_PREDEFINIDAS[0]; // Santa Cruz do Rio Pardo
    const itens = [
      { id: "1", municipio: "Ourinhos", uf: "SP" }, // ~26 km
      { id: "2", municipio: "Bauru", uf: "SP" }, // ~86 km
      { id: "3", municipio: "São Paulo", uf: "SP" }, // ~315 km
      { id: "4", municipio: "Desconhecido", uf: "SP" }, // null
    ];

    // Raio 50 km: apenas Ourinhos
    const ate50 = filtrarLicitaçõesPorRaio(itens, sede, 50);
    expect(ate50).toHaveLength(1);
    expect(ate50[0].id).toBe("1");

    // Raio 100 km: Ourinhos e Bauru
    const ate100 = filtrarLicitaçõesPorRaio(itens, sede, 100);
    expect(ate100).toHaveLength(2);
    expect(ate100.map((i) => i.id)).toEqual(["1", "2"]);

    // Raio 0: sem filtro (retorna todos com distancia_km calculada)
    const semFiltro = filtrarLicitaçõesPorRaio(itens, sede, 0);
    expect(semFiltro).toHaveLength(4);
  });

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
