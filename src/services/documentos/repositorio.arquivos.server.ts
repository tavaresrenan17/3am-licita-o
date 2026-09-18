/**
 * Porta Supabase da fila de arquivos.
 *
 * A reserva e o commit são RPCs `security definer` (Task 1): a chave de serviço
 * fica no servidor e a política de posse mora no banco, não aqui.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ArquivoReservado, GravacaoArquivo, PortaArquivos } from "./worker.arquivos.server";

let cliente: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (cliente) return cliente;
  const url = process.env["SUPABASE_URL"];
  const chave = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !chave) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios");
  cliente = createClient(url, chave, { auth: { persistSession: false } });
  return cliente;
}

export function portaArquivosSupabase(): PortaArquivos {
  return {
    async reservar(limite: number): Promise<ArquivoReservado[]> {
      const { data, error } = await db().rpc("reservar_arquivos", { p_limite: limite });
      if (error) throw new Error(`reservar_arquivos: ${error.message}`);
      return (data ?? []).map((linha: Record<string, unknown>) => ({
        documentoId: String(linha["documento_id"]),
        licitacaoId: String(linha["licitacao_id"]),
        url: String(linha["url"]),
        nome: String(linha["nome"] ?? ""),
        tipoDocumento: String(linha["tipo_documento"] ?? "outro"),
      }));
    },

    async gravar(g: GravacaoArquivo): Promise<void> {
      const { error } = await db().rpc("gravar_arquivo", {
        p_documento_id: g.documentoId,
        p_estado: g.estado,
        p_nome_arquivo: g.nomeArquivo ?? null,
        p_extensao: g.extensao ?? null,
        p_mime: g.mime ?? null,
        p_bytes: g.bytes ?? null,
        p_sha256: g.sha256 ?? null,
        p_paginas: g.paginas ?? null,
        p_chars: g.chars ?? null,
        p_texto: g.texto ?? null,
        p_erro: g.erro ?? null,
      });
      if (error) throw new Error(`gravar_arquivo: ${error.message}`);
    },
  };
}

export async function coberturaArquivos(): Promise<Record<string, number>> {
  const contar = async (filtro: string) => {
    const { count, error } = await db()
      .from("documentos_arquivo")
      .select("documento_id", { count: "exact", head: true })
      .eq("estado", filtro);
    if (error) throw new Error(`cobertura ${filtro}: ${error.message}`);
    return count ?? 0;
  };
  const { count: total, error } = await db()
    .from("documentos_licitacao")
    .select("id", { count: "exact", head: true })
    .not("url", "is", null);
  if (error) throw new Error(`cobertura total: ${error.message}`);
  return {
    total: total ?? 0,
    extraido: await contar("extraido"),
    sem_texto: await contar("sem_texto"),
    grande_demais: await contar("grande_demais"),
    erro: await contar("erro"),
  };
}
