import { describe, expect, it } from "vitest";
import { detectarTipo } from "./tipo";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

describe("detectarTipo", () => {
  it("tira nome e extensão do content-disposition, decodificando o + como espaço", () => {
    const t = detectarTipo({
      contentDisposition: 'attachment; filename="EDITAL+DL+49-2026.pdf"',
      primeirosBytes: PDF,
    });
    expect(t.nomeArquivo).toBe("EDITAL DL 49-2026.pdf");
    expect(t.extensao).toBe("pdf");
    expect(t.mime).toBe("application/pdf");
    expect(t.suportado).toBe(true);
  });

  it("os magic bytes vencem uma extensão mentirosa", () => {
    const t = detectarTipo({
      contentDisposition: 'attachment; filename="edital.pdf"',
      primeirosBytes: ZIP,
    });
    expect(t.mime).toBe("application/zip");
    expect(t.suportado).toBe(false);
  });

  it("cai para o nome catalogado quando não há content-disposition", () => {
    const t = detectarTipo({ contentDisposition: null, primeirosBytes: PDF, nomeCatalogado: "Minuta.PDF" });
    expect(t.extensao).toBe("pdf");
    expect(t.suportado).toBe(true);
  });

  it("sem nenhum sinal confiável, não inventa tipo", () => {
    const t = detectarTipo({ contentDisposition: null, primeirosBytes: new Uint8Array([1, 2, 3, 4]) });
    expect(t.mime).toBeNull();
    expect(t.suportado).toBe(false);
  });

  it("aceita filename* no formato RFC 5987", () => {
    const t = detectarTipo({
      contentDisposition: "attachment; filename*=UTF-8''Termo%20de%20Refer%C3%AAncia.pdf",
      primeirosBytes: PDF,
    });
    expect(t.nomeArquivo).toBe("Termo de Referência.pdf");
  });
});
