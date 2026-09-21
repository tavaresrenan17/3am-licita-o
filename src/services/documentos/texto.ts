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
import zlib from "node:zlib";

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

export interface ItemArquivoZip {
  nome: string;
  dados: Uint8Array;
}

export function descompactarZip(buffer: Uint8Array): ItemArquivoZip[] {
  const arquivos: ItemArquivoZip[] = [];
  let offset = 0;

  while (offset < buffer.length - 30) {
    if (
      buffer[offset] === 0x50 &&
      buffer[offset + 1] === 0x4b &&
      buffer[offset + 2] === 0x03 &&
      buffer[offset + 3] === 0x04
    ) {
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const compressMethod = view.getUint16(offset + 8, true);
      const compSize = view.getUint32(offset + 18, true);
      const uncompSize = view.getUint32(offset + 22, true);
      const nameLen = view.getUint16(offset + 26, true);
      const extraLen = view.getUint16(offset + 28, true);

      const nameBytes = buffer.subarray(offset + 30, offset + 30 + nameLen);
      const nome = new TextDecoder("utf-8").decode(nameBytes);
      const dataStart = offset + 30 + nameLen + extraLen;
      const compData = buffer.subarray(dataStart, dataStart + compSize);

      let dados: Uint8Array;
      if (compressMethod === 0) {
        dados = new Uint8Array(compData);
      } else if (compressMethod === 8) {
        try {
          dados = new Uint8Array(zlib.inflateRawSync(compData));
        } catch {
          dados = new Uint8Array(0);
        }
      } else {
        dados = new Uint8Array(0);
      }

      if (dados.length > 0) {
        arquivos.push({ nome, dados });
      }
      offset = dataStart + compSize;
    } else {
      offset++;
    }
  }
  return arquivos;
}

export async function extrairTextoDocumento(
  bytes: Uint8Array,
  nomeOuMime?: string | null,
): Promise<TextoExtraido> {
  const ehZip =
    (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) ||
    nomeOuMime?.toLowerCase().endsWith(".zip") ||
    nomeOuMime?.includes("application/zip");

  if (ehZip) {
    const itens = descompactarZip(bytes);
    let textoTotal = "";
    let paginasTotal = 0;

    for (const item of itens) {
      const nomeLower = item.nome.toLowerCase();
      if (nomeLower.endsWith(".pdf")) {
        try {
          const resultado = await extrairTextoPdf(item.dados);
          if (resultado.texto.length > 0) {
            textoTotal += `\n--- Arquivo: ${item.nome} ---\n` + resultado.texto;
            paginasTotal += resultado.paginas;
          }
        } catch {
          // Continua para outros arquivos se um falhar
        }
      } else if (
        nomeLower.endsWith(".txt") ||
        nomeLower.endsWith(".csv") ||
        nomeLower.endsWith(".xml")
      ) {
        try {
          const texto = normalizarTexto(new TextDecoder("utf-8").decode(item.dados));
          if (texto.length > 0) {
            textoTotal += `\n--- Arquivo: ${item.nome} ---\n` + texto;
            paginasTotal += 1;
          }
        } catch {
          // Ignora
        }
      }
    }

    const textoFinal = normalizarTexto(textoTotal);
    const chars = textoFinal.length;
    return {
      texto: textoFinal,
      paginas: paginasTotal,
      chars,
      densidade: paginasTotal > 0 ? chars / paginasTotal : chars,
      estado: chars >= DENSIDADE_MINIMA ? "extraido" : "sem_texto",
    };
  }

  // Padrão PDF direto
  return extrairTextoPdf(bytes);
}
