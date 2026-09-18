import { describe, expect, it } from "vitest";
import { baixarArquivo } from "./download.server";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25]);

/** Resposta falsa que entrega o corpo em pedaços, como a rede faz. */
function respostaFalsa(pedacos: Uint8Array[], cabecalhos: Record<string, string> = {}, status = 200) {
  return new Response(
    new ReadableStream({
      start(c) {
        for (const p of pedacos) c.enqueue(p);
        c.close();
      },
    }),
    { status, headers: cabecalhos },
  );
}

describe("baixarArquivo", () => {
  it("baixa, mede e calcula o sha256", async () => {
    const r = await baixarArquivo("https://x/1", {
      fetchImpl: async () =>
        respostaFalsa([PDF], { "content-disposition": 'attachment; filename="a.pdf"' }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tamanho).toBe(PDF.length);
    expect(r.tipo.mime).toBe("application/pdf");
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("aborta pelo content-length antes de ler o corpo", async () => {
    let leu = false;
    const r = await baixarArquivo("https://x/1", {
      maxBytes: 100,
      fetchImpl: async () => {
        const resp = respostaFalsa([new Uint8Array(500)], { "content-length": "500" });
        Object.defineProperty(resp, "body", {
          get() {
            leu = true;
            return null;
          },
        });
        return resp;
      },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("grande_demais");
    expect(leu).toBe(false);
  });

  it("aborta durante o corpo quando não há content-length", async () => {
    const pedaco = new Uint8Array(60);
    const r = await baixarArquivo("https://x/1", {
      maxBytes: 100,
      fetchImpl: async () => respostaFalsa([pedaco, pedaco, pedaco]),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("grande_demais");
  });

  it("trata HTTP de erro sem lançar", async () => {
    const r = await baixarArquivo("https://x/1", {
      fetchImpl: async () => respostaFalsa([], {}, 404),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("http");
    expect(r.detalhe).toContain("404");
  });

  it("corpo vazio é falha explícita, não sucesso silencioso", async () => {
    const r = await baixarArquivo("https://x/1", {
      fetchImpl: async () => respostaFalsa([new Uint8Array(0)]),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("vazio");
  });
});
