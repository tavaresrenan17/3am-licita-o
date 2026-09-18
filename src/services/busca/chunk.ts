/**
 * Divisão do texto de um edital em trechos vetorizáveis.
 *
 * Sobreposição existe porque a informação que responde à busca costuma cair na
 * emenda: um trecho termina no meio da descrição do objeto e o seguinte começa
 * depois dela. 200 chars de sobreposição custam pouco e evitam esse buraco.
 *
 * O teto por documento é controle de tamanho de banco, não de qualidade: um
 * edital medido tinha 103 mil chars, o que daria ~70 trechos. Os 40 primeiros
 * cobrem objeto, dotação e habilitação, que é onde a intenção de busca mora.
 * Revisar com medição de onde os acertos realmente caem.
 */
export const TAMANHO_CHUNK = 1500;
export const SOBREPOSICAO = 200;
export const MAX_CHUNKS_DOC = 40;

export interface OpcoesChunk {
  tamanho?: number;
  sobreposicao?: number;
  maxChunks?: number;
}

export function dividirEmChunks(texto: string, opcoes: OpcoesChunk = {}): string[] {
  const tamanho = opcoes.tamanho ?? TAMANHO_CHUNK;
  const maxChunks = opcoes.maxChunks ?? MAX_CHUNKS_DOC;
  // Sobreposição ≥ tamanho faria o cursor andar para trás e o laço nunca
  // terminar. Limitar aqui é mais seguro que confiar em quem chama.
  const sobreposicao = Math.min(opcoes.sobreposicao ?? SOBREPOSICAO, tamanho - 1);

  const limpo = texto.trim();
  if (limpo.length === 0) return [];
  if (limpo.length <= tamanho) return [limpo];

  const chunks: string[] = [];
  let inicio = 0;

  while (inicio < limpo.length && chunks.length < maxChunks) {
    let fim = Math.min(inicio + tamanho, limpo.length);

    if (fim < limpo.length) {
      // Recuar até o último espaço, para não partir palavra no meio. Só recua
      // dentro dos últimos 20% do trecho: mais que isso encolheria demais.
      const espaco = limpo.lastIndexOf(" ", fim);
      if (espaco > inicio + tamanho * 0.8) fim = espaco;
    }

    const trecho = limpo.slice(inicio, fim).trim();
    if (trecho.length > 0) chunks.push(trecho);

    if (fim >= limpo.length) break;
    inicio = fim - sobreposicao;
  }

  return chunks;
}
