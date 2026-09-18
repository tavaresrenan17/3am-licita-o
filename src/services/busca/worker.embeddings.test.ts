import { describe, expect, it } from "vitest";
import { EmbedderFalso } from "./embedder";
import {
  executarTickEmbeddings,
  type DocumentoParaEmbedding,
  type LicitacaoParaEmbedding,
  type PortaEmbeddings,
} from "./worker.embeddings.server";

function bancoFalso(
  licitacoes: LicitacaoParaEmbedding[] = [],
  documentos: DocumentoParaEmbedding[] = [],
) {
  const gravadasLic: Array<{ id: string; literal: string; modelo: string }> = [];
  const gravadosChunks: Array<{
    documentoId: string;
    chunks: Array<{ ordem: number; texto: string; literal: string }>;
  }> = [];
  const banco: PortaEmbeddings = {
    async reservarLicitacoes(limite) {
      return licitacoes.splice(0, limite);
    },
    async reservarDocumentos(limite) {
      return documentos.splice(0, limite);
    },
    async gravarLicitacao(licitacaoId, literal, modelo) {
      gravadasLic.push({ id: licitacaoId, literal, modelo });
    },
    async gravarChunks(documentoId, _licitacaoId, chunks) {
      gravadosChunks.push({ documentoId, chunks });
    },
  };
  return { banco, gravadasLic, gravadosChunks };
}

describe("executarTickEmbeddings", () => {
  it("vetoriza licitações e grava no formato literal do pgvector", async () => {
    const { banco, gravadasLic } = bancoFalso([
      { licitacaoId: "l1", texto: "pavimentação asfáltica", origemHash: "h1" },
    ]);
    const resumo = await executarTickEmbeddings({ banco, embedder: new EmbedderFalso() });
    expect(resumo.licitacoes).toBe(1);
    expect(gravadasLic[0]!.literal).toMatch(/^\[/);
    expect(gravadasLic[0]!.modelo).toBe("falso");
  });

  it("divide o documento em chunks e grava todos de uma vez", async () => {
    const { banco, gravadosChunks } = bancoFalso(
      [],
      [{ documentoId: "d1", licitacaoId: "l1", texto: "a ".repeat(4000), origemHash: "h2" }],
    );
    const resumo = await executarTickEmbeddings({ banco, embedder: new EmbedderFalso() });
    expect(resumo.documentos).toBe(1);
    expect(resumo.chunks).toBeGreaterThan(1);
    expect(gravadosChunks).toHaveLength(1);
    expect(gravadosChunks[0]!.chunks[0]!.ordem).toBe(0);
  });

  it("respeita o teto de chunks por documento", async () => {
    const { banco, gravadosChunks } = bancoFalso(
      [],
      [{ documentoId: "d1", licitacaoId: "l1", texto: "a".repeat(500_000), origemHash: "h" }],
    );
    await executarTickEmbeddings({ banco, embedder: new EmbedderFalso(), maxChunksDoc: 3 });
    expect(gravadosChunks[0]!.chunks).toHaveLength(3);
  });

  it("documento sem texto aproveitável não vira chunk nem erro", async () => {
    const { banco, gravadosChunks } = bancoFalso(
      [],
      [{ documentoId: "d1", licitacaoId: "l1", texto: "   ", origemHash: "h" }],
    );
    const resumo = await executarTickEmbeddings({ banco, embedder: new EmbedderFalso() });
    expect(gravadosChunks).toHaveLength(0);
    expect(resumo.erros).toHaveLength(0);
  });

  it("falha do provedor num lote não derruba os outros", async () => {
    const { banco, gravadasLic } = bancoFalso([
      { licitacaoId: "l1", texto: "explode", origemHash: "h1" },
      { licitacaoId: "l2", texto: "ok", origemHash: "h2" },
    ]);
    const embedder = new EmbedderFalso();
    const original = embedder.embed.bind(embedder);
    embedder.embed = async (textos: string[]) => {
      if (textos.includes("explode")) throw new Error("provedor fora");
      return original(textos);
    };
    const resumo = await executarTickEmbeddings({ banco, embedder, loteEmbedding: 1 });
    expect(resumo.erros).toHaveLength(1);
    expect(gravadasLic.map((g) => g.id)).toEqual(["l2"]);
  });

  it("fila vazia é sinalizada", async () => {
    const { banco } = bancoFalso();
    const resumo = await executarTickEmbeddings({ banco, embedder: new EmbedderFalso() });
    expect(resumo.filaVazia).toBe(true);
  });
});
