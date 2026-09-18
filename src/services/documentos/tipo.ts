/**
 * Tipo real de um arquivo baixado do PNCP.
 *
 * Medido em 18/09/2026: a rota `/arquivos/{n}` devolve SEMPRE
 * `content-type: application/octet-stream`, para PDF e para qualquer outra
 * coisa. Confiar nesse cabeçalho é não classificar nada. Os sinais que
 * realmente informam, em ordem de precedência:
 *
 *   1. magic bytes do próprio conteúdo — não mentem;
 *   2. `content-disposition: attachment; filename="..."` — é onde o nome real
 *      aparece, com `+` no lugar dos espaços;
 *   3. o nome já catalogado em `documentos_licitacao.nome`.
 */

export interface SinaisTipo {
  contentDisposition?: string | null;
  primeirosBytes?: Uint8Array | null;
  nomeCatalogado?: string | null;
}

export interface TipoArquivo {
  nomeArquivo: string | null;
  extensao: string | null;
  mime: string | null;
  /** true só para o que a v1 sabe extrair texto. */
  suportado: boolean;
}

const ASSINATURAS: ReadonlyArray<{ bytes: number[]; mime: string; extensao: string }> = [
  { bytes: [0x25, 0x50, 0x44, 0x46], mime: "application/pdf", extensao: "pdf" }, // %PDF
  { bytes: [0x50, 0x4b, 0x03, 0x04], mime: "application/zip", extensao: "zip" }, // PK..
  { bytes: [0xd0, 0xcf, 0x11, 0xe0], mime: "application/msword", extensao: "doc" },
];

const SUPORTADOS = new Set(["application/pdf"]);

function nomeDoContentDisposition(cd: string): string | null {
  const rfc5987 = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(cd);
  if (rfc5987?.[1]) {
    try {
      return decodeURIComponent(rfc5987[1].trim());
    } catch {
      return rfc5987[1].trim();
    }
  }
  const simples = /filename\s*=\s*"?([^";]+)"?/i.exec(cd);
  if (!simples?.[1]) return null;
  // O PNCP entrega espaços como `+`.
  return simples[1].trim().replace(/\+/g, " ");
}

export function detectarTipo(sinais: SinaisTipo): TipoArquivo {
  const nomeArquivo = sinais.contentDisposition
    ? nomeDoContentDisposition(sinais.contentDisposition)
    : (sinais.nomeCatalogado ?? null);

  const porAssinatura = ASSINATURAS.find((a) =>
    a.bytes.every((b, i) => sinais.primeirosBytes?.[i] === b),
  );

  const extensaoDoNome = nomeArquivo?.includes(".")
    ? (nomeArquivo.split(".").pop()!.toLowerCase() || null)
    : null;

  const mime = porAssinatura?.mime ?? null;
  const extensao = porAssinatura?.extensao ?? extensaoDoNome;

  return {
    nomeArquivo,
    extensao,
    mime,
    suportado: mime !== null && SUPORTADOS.has(mime),
  };
}
