/**
 * Reciprocal Rank Fusion, escrito a partir da definição.
 *
 * Esta é a referência independente que o critério C11 do arquivo 05 exige: o
 * teste da busca não pode repetir a implementação de produção dentro de si. O
 * SQL da `buscar_licitacoes_hibrida` calcula a mesma coisa por outro caminho;
 * confrontar os dois é o que dá confiança em qualquer um deles.
 *
 *   score(d) = Σ_r  peso_r / (k + posição_r(d))
 *
 * `posição` começa em 1. `k` amortece as primeiras posições: sem ele, o 1º
 * lugar de um único ranking dominaria toda a fusão.
 */
export const K_RRF = 60;

export interface RankingRRF {
  peso: number;
  /** Ids em ordem de relevância: o primeiro está na posição 1. */
  ids: string[];
}

export function fundirRRF(
  rankings: RankingRRF[],
  k: number = K_RRF,
): Array<{ id: string; score: number }> {
  const scores = new Map<string, number>();

  for (const ranking of rankings) {
    ranking.ids.forEach((id, indice) => {
      const posicao = indice + 1;
      scores.set(id, (scores.get(id) ?? 0) + ranking.peso / (k + posicao));
    });
  }

  return (
    [...scores.entries()]
      .map(([id, score]) => ({ id, score }))
      // Desempate por id: a ordem precisa ser a mesma entre execuções.
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  );
}
