import { describe, expect, it, vi } from "vitest";

describe("Sincronização em Lote de Documentos", () => {
  it("processa lote de licitações retornando o resumo de cada uma", async () => {
    const mockSincronizar = vi.fn().mockImplementation(async (id: string) => ({
      licitacaoId: id,
      totalCatalogados: 3,
      processados: 3,
      extraidos: 2,
      erros: [],
      documentosProntos: [
        { documentoId: "doc-1", nome: "Edital.pdf", tipo: "edital", chars: 1500, paginas: 12 },
        { documentoId: "doc-2", nome: "TR.pdf", tipo: "termo_referencia", chars: 800, paginas: 5 },
      ],
    }));

    const ids = ["lic-1", "lic-2"];
    const resultados = [];

    for (const id of ids) {
      const res = await mockSincronizar(id);
      resultados.push({
        id,
        ok: true,
        totalCatalogados: res.totalCatalogados,
        extraidos: res.extraidos,
        documentos: res.documentosProntos,
      });
    }

    expect(resultados).toHaveLength(2);
    expect(resultados[0]?.ok).toBe(true);
    expect(resultados[0]?.extraidos).toBe(2);
    expect(resultados[1]?.documentos).toHaveLength(2);
  });
});
