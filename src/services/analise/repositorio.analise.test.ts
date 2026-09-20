import { describe, expect, it, vi } from "vitest";
import { criarRepositorioAnalise, type PortaSupabaseAnalise } from "./repositorio.analise.server";

function portaFake(sobrescritas: Partial<PortaSupabaseAnalise> = {}): PortaSupabaseAnalise {
  return {
    obterLicitacao: vi.fn(async () => ({ id: "lic-a", objeto: "Obra" })),
    obterDocumentos: vi.fn(async () => []),
    contarChunks: vi.fn(async () => 0),
    obterAnalise: vi.fn(async () => null),
    rpc: vi.fn(async () => []),
    ...sobrescritas,
  };
}

describe("repositorio de analise", () => {
  it("obtem somente documentos ativos e explicita a disponibilidade de chunks", async () => {
    const porta = portaFake({
      obterDocumentos: vi.fn(async () => [
        {
          id: "doc-a",
          nome: "Edital.pdf",
          tipo_documento: "edital",
          ativo: true,
          estado: "extraido",
          texto: "conteudo integral",
          sha256: "hash-a",
        },
      ]),
      contarChunks: vi.fn(async () => 7),
    });
    const repositorio = criarRepositorioAnalise(porta);

    const materia = await repositorio.obterMateriaPrima("lic-a");

    expect(porta.obterDocumentos).toHaveBeenCalledWith("lic-a", true);
    expect(materia.documentos[0]).toMatchObject({
      documentoId: "doc-a",
      texto: "conteudo integral",
      sha256: "hash-a",
    });
    expect(materia.chunksDisponiveis).toBe(7);
  });

  it("nunca mistura chunks de outra licitacao", async () => {
    const rpc = vi.fn(async () => [
      {
        chunk_id: "chunk-a",
        documento_id: "doc-a",
        nome: "Edital.pdf",
        tipo: "edital",
        ordem: 2,
        trecho: "prazo de 30 dias",
        distancia: 0.12,
      },
    ]);
    const repositorio = criarRepositorioAnalise(portaFake({ rpc }));

    const fontes = await repositorio.buscarChunks("lic-a", [0.1, 0.2], "bge-m3", 8);

    expect(rpc).toHaveBeenCalledWith("buscar_chunks_analise", {
      p_licitacao_id: "lic-a",
      p_embedding: "[0.1,0.2]",
      p_modelo: "bge-m3",
      p_limite: 8,
    });
    expect(fontes).toEqual([
      {
        id: "chunk-a",
        documentoId: "doc-a",
        nome: "Edital.pdf",
        tipo: "edital",
        ordem: 2,
        trecho: "prazo de 30 dias",
        distancia: 0.12,
      },
    ]);
  });

  it("repassa fingerprint e force ao adquirir o lease", async () => {
    const rpc = vi.fn(async () => [
      { adquirido: true, linha: { licitacao_id: "lic-a", estado: "processando" } },
    ]);
    const repositorio = criarRepositorioAnalise(portaFake({ rpc }));

    const lease = await repositorio.adquirirLease("lic-a", "fp-atual", true, "prompt-1", "alg-1");

    expect(rpc).toHaveBeenCalledWith("adquirir_lease_analise", {
      p_licitacao_id: "lic-a",
      p_fingerprint: "fp-atual",
      p_forcar: true,
      p_prompt_versao: "prompt-1",
      p_algoritmo_versao: "alg-1",
    });
    expect(lease.adquirido).toBe(true);
    expect(lease.linha?.estado).toBe("processando");
  });

  it("mapeia o cache persistido com fingerprint e versoes", async () => {
    const repositorio = criarRepositorioAnalise(
      portaFake({
        obterAnalise: vi.fn(async () => ({
          licitacao_id: "lic-a",
          estado: "pronta",
          resultado: { resumoExecutivo: "resumo" },
          fontes: [],
          cobertura: { estado: "completa" },
          fingerprint: "fp-atual",
          modelo: "modelo-a",
          prompt_versao: "prompt-1",
          algoritmo_versao: "alg-1",
          lease_id: null,
          lease_expira_em: null,
          erro: null,
          gerado_em: "2026-09-20T12:00:00Z",
          atualizado_em: "2026-09-20T12:00:00Z",
        })),
      }),
    );

    const cache = await repositorio.obterAnalise("lic-a");

    expect(cache).toMatchObject({
      licitacaoId: "lic-a",
      estado: "pronta",
      fingerprint: "fp-atual",
      promptVersao: "prompt-1",
      algoritmoVersao: "alg-1",
    });
  });

  it("conclui e falha apenas com o lease recebido", async () => {
    const rpc = vi.fn(async () => null);
    const repositorio = criarRepositorioAnalise(portaFake({ rpc }));

    await repositorio.concluir({
      licitacaoId: "lic-a",
      leaseId: "lease-a",
      resultado: { resumoExecutivo: "ok" },
      fontes: [{ id: "chunk-a" }],
      cobertura: { estado: "completa" },
      modelo: "modelo-a",
    });
    await repositorio.falhar("lic-a", "lease-a", "timeout");

    expect(rpc).toHaveBeenNthCalledWith(1, "concluir_analise_licitacao", {
      p_licitacao_id: "lic-a",
      p_lease_id: "lease-a",
      p_resultado: { resumoExecutivo: "ok" },
      p_fontes: [{ id: "chunk-a" }],
      p_cobertura: { estado: "completa" },
      p_modelo: "modelo-a",
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "falhar_analise_licitacao", {
      p_licitacao_id: "lic-a",
      p_lease_id: "lease-a",
      p_erro: "timeout",
    });
  });

  it("propaga erros da porta com o nome da operacao", async () => {
    const repositorio = criarRepositorioAnalise(
      portaFake({
        obterAnalise: vi.fn(async () => {
          throw new Error("indisponivel");
        }),
      }),
    );

    await expect(repositorio.obterAnalise("lic-a")).rejects.toThrow("obter analise: indisponivel");
  });
});
