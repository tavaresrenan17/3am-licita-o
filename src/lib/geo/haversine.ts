import { obterCoordenadasMunicipio } from "./cidades";
import type { PontoGeografico } from "./tipos";

/**
 * Converte graus para radianos.
 */
function toRad(graus: number): number {
  return (graus * Math.PI) / 180;
}

/**
 * Calcula a distância em quilômetros entre dois pontos usando a fórmula Haversine.
 * @param p1 Ponto de Origem (lat, lon)
 * @param p2 Ponto de Destino (lat, lon)
 * @returns Distância em km arredondada com 1 casa decimal
 */
export function calcularDistanciaHaversine(p1: PontoGeografico, p2: PontoGeografico): number {
  const R = 6371; // Raio médio da Terra em km

  const dLat = toRad(p2.lat - p1.lat);
  const dLon = toRad(p2.lon - p1.lon);

  const lat1 = toRad(p1.lat);
  const lat2 = toRad(p2.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distanciaKm = R * c;
  return Math.round(distanciaKm * 10) / 10;
}

/**
 * Calcula a distância em km de uma licitação a partir de uma origem.
 */
export function calcularDistanciaLicitacao(
  origem: PontoGeografico,
  licitacao: { municipio?: string | null; uf?: string | null },
): number | null {
  const pontoDestino = obterCoordenadasMunicipio(licitacao.municipio, licitacao.uf);
  if (!pontoDestino) return null;

  return calcularDistanciaHaversine(origem, pontoDestino);
}

/**
 * Classificação semântica da proximidade para exibição em badges.
 */
export function obterFaixaProximidade(
  distanciaKm?: number | null,
): "muito_perto" | "media" | "longe" | "desconhecido" {
  if (distanciaKm === undefined || distanciaKm === null || isNaN(distanciaKm)) {
    return "desconhecido";
  }
  if (distanciaKm <= 100) return "muito_perto";
  if (distanciaKm <= 250) return "media";
  return "longe";
}

/**
 * Formata a distância em km para leitura amigável (ex: "45,2 km").
 */
export function formatarDistanciaKm(distanciaKm?: number | null): string {
  if (distanciaKm === undefined || distanciaKm === null || isNaN(distanciaKm)) {
    return "—";
  }
  return `${distanciaKm.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

/**
 * Filtra e enriquece uma lista de licitações pelo raio em km a partir de uma origem geográfica.
 * Se raioMaximoKm <= 0, retorna todos os itens enriquecidos com a distância calculada.
 */
export function filtrarLicitaçõesPorRaio<
  T extends { municipio?: string | null; uf?: string | null; distancia_km?: number | null },
>(
  itens: T[],
  origem: PontoGeografico,
  raioMaximoKm: number,
): (T & { distancia_km: number | null })[] {
  const enriquecidos = itens.map((item) => {
    const distancia = calcularDistanciaLicitacao(origem, item);
    return {
      ...item,
      distancia_km: distancia,
    };
  });

  if (raioMaximoKm <= 0) {
    return enriquecidos;
  }

  return enriquecidos.filter((item) => {
    // Só inclui licitações que possuem localização mapeada e estão dentro do raio
    return item.distancia_km !== null && item.distancia_km <= raioMaximoKm;
  });
}
