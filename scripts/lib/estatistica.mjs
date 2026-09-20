/**
 * Estatistica de latencia, extraida de experimento-busca.mjs para ser testavel
 * isoladamente com vitest. Sem dependencias externas de proposito: este modulo
 * roda tanto no harness (Node puro) quanto nos testes.
 */

/**
 * Percentil por nearest-rank (sem interpolacao). Lista vazia devolve null: nao
 * ha percentil de nada, e null e mais honesto que 0 ou NaN.
 */
export function percentil(valores, p) {
  if (valores.length === 0) return null;
  const ordenado = [...valores].sort((a, b) => a - b);
  const i = Math.min(ordenado.length - 1, Math.ceil((p / 100) * ordenado.length) - 1);
  return ordenado[Math.max(i, 0)];
}

/**
 * Resumo de uma amostra de latencias (em ms). Nao depende da ordem de entrada:
 * percentil() ordena por conta propria, e min/max/media sao comutativos.
 *
 * Lista vazia devolve { amostras: 0 } com os demais campos null, em vez de
 * lancar excecao — o harness pode chamar isto antes de ter qualquer medicao
 * (ex.: uma consulta que falhou e nao produziu nenhuma repeticao).
 */
export function resumoLatencia(amostras) {
  if (amostras.length === 0) {
    return { amostras: 0, p50: null, p95: null, p99: null, min: null, max: null, media: null };
  }
  const soma = amostras.reduce((acc, v) => acc + v, 0);
  return {
    amostras: amostras.length,
    p50: percentil(amostras, 50),
    p95: percentil(amostras, 95),
    p99: percentil(amostras, 99),
    min: Math.min(...amostras),
    max: Math.max(...amostras),
    // Arredondada: latencia em ms nao tem casa decimal significativa aqui, e
    // um inteiro e mais facil de comparar visualmente no relatorio.
    media: Math.round(soma / amostras.length),
  };
}
