/**
 * Texto de um PDF do PNCP.
 *
 * Medido em 18/09/2026 sobre dois editais reais: 2.726 e 1.300 chars por
 * página, extraídos em 684 ms e 1.581 ms. Extrair é barato perto de baixar.
 *
 * PDF escaneado não tem camada de texto e produziria chunks vazios que sujam
 * o vetorial sem acrescentar nada. A densidade é o sinal: abaixo de 200
 * chars/página o arquivo é marcado `sem_texto` e não entra na fila de
 * embedding. A v1 não faz OCR — a decisão está na spec, §9.
 */
export const DENSIDADE_MINIMA = 200;

export interface TextoExtraido {
  texto: string;
  paginas: number;
  chars: number;
  densidade: number;
  estado: "extraido" | "sem_texto";
}

export function normalizarTexto(bruto: string): string {
  // O Postgres recusa o caractere nulo (0x00) em colunas text, e PDFs trazem isso.
  return bruto.replace(/\0/g, "").replace(/\s+/g, " ").trim();
}

export function avaliarDensidade(chars: number, paginas: number): "extraido" | "sem_texto" {
  if (paginas <= 0) return "sem_texto";
  return chars / paginas >= DENSIDADE_MINIMA ? "extraido" : "sem_texto";
}

export async function extrairTextoPdf(bytes: Uint8Array): Promise<TextoExtraido> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  const texto = normalizarTexto(Array.isArray(text) ? text.join(" ") : text);
  const paginas = totalPages ?? 0;
  return {
    texto,
    paginas,
    chars: texto.length,
    densidade: paginas > 0 ? texto.length / paginas : 0,
    estado: avaliarDensidade(texto.length, paginas),
  };
}
