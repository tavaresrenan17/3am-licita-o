import { describe, expect, it } from "vitest";
import { DIMENSOES, EmbedderFalso, ErroDimensao, OllamaEmbedder, paraLiteralPg } from "./embedder";

function respostaJson(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const vetor = (n: number) => Array.from({ length: n }, (_, i) => i / n);

describe("OllamaEmbedder", () => {
  it("manda o lote inteiro numa requisição só", async () => {
    let corpoEnviado: unknown = null;
    const e = new OllamaEmbedder({
      fetchImpl: async (_url, init) => {
        corpoEnviado = JSON.parse(String((init as RequestInit).body));
        return respostaJson({ embeddings: [vetor(DIMENSOES), vetor(DIMENSOES)] });
      },
    });
    const r = await e.embed(["a", "b"]);
    expect(r).toHaveLength(2);
    expect(r[0]).toBeInstanceOf(Float32Array);
    expect((corpoEnviado as { input: string[] }).input).toEqual(["a", "b"]);
  });

  it("recusa vetor com dimensão diferente da esperada", async () => {
    const e = new OllamaEmbedder({
      fetchImpl: async () => respostaJson({ embeddings: [vetor(384)] }),
    });
    await expect(e.embed(["a"])).rejects.toBeInstanceOf(ErroDimensao);
  });

  it("erro HTTP vira exceção com o status", async () => {
    const e = new OllamaEmbedder({ fetchImpl: async () => respostaJson({ error: "x" }, 500) });
    await expect(e.embed(["a"])).rejects.toThrow(/500/);
  });

  it("lote vazio não faz requisição", async () => {
    let chamou = false;
    const e = new OllamaEmbedder({
      fetchImpl: async () => {
        chamou = true;
        return respostaJson({ embeddings: [] });
      },
    });
    expect(await e.embed([])).toEqual([]);
    expect(chamou).toBe(false);
  });
});

describe("paraLiteralPg", () => {
  it("serializa no formato que o pgvector aceita", () => {
    expect(paraLiteralPg(new Float32Array([1, 0.5, -0.25]))).toBe("[1,0.5,-0.25]");
  });
});

describe("EmbedderFalso", () => {
  it("é determinístico: mesmo texto, mesmo vetor", async () => {
    const e = new EmbedderFalso();
    const [a] = await e.embed(["reforma de escola"]);
    const [b] = await e.embed(["reforma de escola"]);
    expect(Array.from(a!)).toEqual(Array.from(b!));
    expect(a).toHaveLength(DIMENSOES);
  });
});

describe("OpenAIEmbedder", () => {
  it("envia parâmetros corretos com dimensões 1024", async () => {
    let corpoEnviado: unknown = null;
    let authHeader: string | null = null;
    const { OpenAIEmbedder } = await import("./embedder");
    const e = new OpenAIEmbedder({
      apiKey: "chave-teste",
      fetchImpl: async (_url, init) => {
        authHeader = (init?.headers as Record<string, string>)?.["authorization"] ?? null;
        corpoEnviado = JSON.parse(String((init as RequestInit).body));
        return respostaJson({
          data: [{ embedding: vetor(DIMENSOES), index: 0 }],
        });
      },
    });
    const r = await e.embed(["consulta"]);
    expect(r).toHaveLength(1);
    expect(r[0]).toBeInstanceOf(Float32Array);
    expect(authHeader).toBe("Bearer chave-teste");
    expect((corpoEnviado as { dimensions: number }).dimensions).toBe(DIMENSOES);
  });

  it("recusa dimensão incorreta", async () => {
    const { OpenAIEmbedder } = await import("./embedder");
    const e = new OpenAIEmbedder({
      apiKey: "chave-teste",
      fetchImpl: async () =>
        respostaJson({
          data: [{ embedding: vetor(512), index: 0 }],
        }),
    });
    await expect(e.embed(["consulta"])).rejects.toBeInstanceOf(ErroDimensao);
  });
});
