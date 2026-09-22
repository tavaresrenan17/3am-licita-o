// A distância em si é calculada no banco (`public.distancia_km`, a partir do
// código IBGE). Aqui fica só a apresentação do número que chega pronto.

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
