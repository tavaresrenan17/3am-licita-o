/**
 * Porta Supabase da fila de embeddings.
 *
 * O vetor viaja como literal de texto (`[0.1,0.2,...]`) e o cast para halfvec
 * acontece dentro da função SQL: o PostgREST não serializa o tipo halfvec, e
 * mandar texto é o caminho que funciona sem driver especial.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  DocumentoParaEmbedding,
  LicitacaoParaEmbedding,
  PortaEmbeddings,
} from "./worker.embeddings.server";

let cliente: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (cliente) return cliente;
  const url = process.env["SUPABASE_URL"];
  const chave = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !chave) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios");
  cliente = createClient(url, chave, { auth: { persistSession: false } });
  return cliente;
}

export function portaEmbeddingsSupabase(modelo: string): PortaEmbeddings {
  return {
    async reservarLicitacoes(limite: number): Promise<LicitacaoParaEmbedding[]> {
      const { data, error } = await db().rpc("reservar_licitacoes_para_embedding", {
        p_limite: limite,
        p_modelo: modelo,
      });
      if (error) throw new Error(`reservar_licitacoes_para_embedding: ${error.message}`);
      return (data ?? []).map((l: Record<string, unknown>) => ({
        licitacaoId: String(l["licitacao_id"]),
        texto: String(l["texto"] ?? ""),
        origemHash: String(l["origem_hash"]),
      }));
    },

    async reservarDocumentos(limite: number): Promise<DocumentoParaEmbedding[]> {
      const { data, error } = await db().rpc("reservar_documentos_para_embedding", {
        p_limite: limite,
        p_modelo: modelo,
      });
      if (error) throw new Error(`reservar_documentos_para_embedding: ${error.message}`);
      return (data ?? []).map((d: Record<string, unknown>) => ({
        documentoId: String(d["documento_id"]),
        licitacaoId: String(d["licitacao_id"]),
        texto: String(d["texto"] ?? ""),
        origemHash: String(d["origem_hash"]),
      }));
    },

    async gravarLicitacao(licitacaoId, literal, modeloUsado, versao, origemHash) {
      const { error } = await db().rpc("gravar_embedding_licitacao", {
        p_licitacao_id: licitacaoId,
        p_embedding: literal,
        p_modelo: modeloUsado,
        p_versao: versao,
        p_origem_hash: origemHash,
      });
      if (error) throw new Error(`gravar_embedding_licitacao: ${error.message}`);
    },

    async gravarChunks(documentoId, licitacaoId, chunks, modeloUsado, versao, origemHash) {
      const { error } = await db().rpc("gravar_chunks_documento", {
        p_documento_id: documentoId,
        p_licitacao_id: licitacaoId,
        p_chunks: chunks,
        p_modelo: modeloUsado,
        p_versao: versao,
        p_origem_hash: origemHash,
      });
      if (error) throw new Error(`gravar_chunks_documento: ${error.message}`);
    },
  };
}

export async function coberturaEmbeddings(): Promise<Record<string, number>> {
  const { data, error } = await db().rpc("cobertura_embeddings");
  if (error) throw new Error(`cobertura_embeddings: ${error.message}`);
  return (data ?? {}) as Record<string, number>;
}
