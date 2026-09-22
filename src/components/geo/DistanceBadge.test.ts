import { describe, expect, it } from "vitest";
import { obterFaixaProximidade, formatarDistanciaKm } from "@/lib/geo/haversine";

describe("Componentes e Utilitários do DistanceBadge", () => {
  it("determina as faixas de cores semânticas com precisão", () => {
    // <= 100km: muito perto (esmeralda/verde)
    expect(obterFaixaProximidade(10)).toBe("muito_perto");
    expect(obterFaixaProximidade(99.9)).toBe("muito_perto");
    expect(obterFaixaProximidade(100)).toBe("muito_perto");

    // 101km - 250km: media (âmbar/amarelo)
    expect(obterFaixaProximidade(100.1)).toBe("media");
    expect(obterFaixaProximidade(180)).toBe("media");
    expect(obterFaixaProximidade(250)).toBe("media");

    // > 250km: longe (cinza/muted)
    expect(obterFaixaProximidade(250.1)).toBe("longe");
    expect(obterFaixaProximidade(500)).toBe("longe");

    // nulo ou indefinido: desconhecido
    expect(obterFaixaProximidade(null)).toBe("desconhecido");
    expect(obterFaixaProximidade(undefined)).toBe("desconhecido");
  });

  it("formata o texto da distância em padrão brasileiro", () => {
    expect(formatarDistanciaKm(35.5)).toBe("35,5 km");
    expect(formatarDistanciaKm(0)).toBe("0,0 km");
    expect(formatarDistanciaKm(120)).toBe("120,0 km");
    expect(formatarDistanciaKm(null)).toBe("—");
  });
});
