/**
 * Download de um arquivo do PNCP, com teto de bytes.
 *
 * O teto fecha o critério R04 do arquivo 05. Ele não é teórico: medido em
 * 18/09/2026, dois documentos sorteados vieram com 392 KB (0,85 s) e 10,9 MB
 * (15,2 s). Sem teto, um único anexo consome o tick inteiro e a fila para.
 *
 * O corte acontece em dois lugares porque o PNCP nem sempre manda
 * `content-length`: antes de tocar no corpo quando o cabeçalho existe, e
 * durante a leitura quando não existe.
 */
import { createHash } from "node:crypto";
import { detectarTipo, type TipoArquivo } from "./tipo";

export const MAX_BYTES_PADRAO = 26_214_400; // 25 MB

export interface OpcoesDownload {
  maxBytes?: number;
  fetchImpl?: typeof fetch;
  nomeCatalogado?: string | null;
}

export type ResultadoDownload =
  | { ok: true; bytes: Uint8Array; sha256: string; tipo: TipoArquivo; tamanho: number }
  | { ok: false; motivo: "grande_demais" | "http" | "vazio"; detalhe: string; tamanho?: number };

export function normalizarUrlDownload(url: string): string {
  // A API do PNCP por vezes devolve URLs com porta interna :1401 (ex: https://pncp.gov.br:1401/...)
  // Essa porta sofre timeout por bloqueios/firewalls; remover a porta usa a porta 443 padrão.
  return url.replace(/:1401(?=\/|$)/, "");
}

export async function baixarArquivo(
  url: string,
  opcoes: OpcoesDownload = {},
): Promise<ResultadoDownload> {
  const urlFinal = normalizarUrlDownload(url);
  const maxBytes = opcoes.maxBytes ?? MAX_BYTES_PADRAO;
  const buscar = opcoes.fetchImpl ?? fetch;

  const resposta = await buscar(urlFinal, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    },
  });

  if (!resposta.ok) {
    return { ok: false, motivo: "http", detalhe: `HTTP ${resposta.status}` };
  }

  const declarado = Number(resposta.headers.get("content-length") ?? "");
  if (Number.isFinite(declarado) && declarado > maxBytes) {
    // Não ler o corpo: o ponto do teto é não gastar a rede.
    return {
      ok: false,
      motivo: "grande_demais",
      detalhe: `content-length ${declarado} > ${maxBytes}`,
      tamanho: declarado,
    };
  }

  const corpo = resposta.body;
  const pedacos: Uint8Array[] = [];
  let total = 0;

  if (corpo) {
    const leitor = corpo.getReader();
    while (true) {
      const { done, value } = await leitor.read();
      if (done) break;
      if (!value) continue;
      total += value.length;
      if (total > maxBytes) {
        await leitor.cancel();
        return {
          ok: false,
          motivo: "grande_demais",
          detalhe: `corpo passou de ${maxBytes} bytes`,
          tamanho: total,
        };
      }
      pedacos.push(value);
    }
  }

  if (total === 0) {
    return { ok: false, motivo: "vazio", detalhe: "corpo sem bytes" };
  }

  const bytes = new Uint8Array(total);
  let posicao = 0;
  for (const p of pedacos) {
    bytes.set(p, posicao);
    posicao += p.length;
  }

  return {
    ok: true,
    bytes,
    tamanho: total,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    tipo: detectarTipo({
      contentDisposition: resposta.headers.get("content-disposition"),
      primeirosBytes: bytes.subarray(0, 8),
      nomeCatalogado: opcoes.nomeCatalogado ?? null,
    }),
  };
}
