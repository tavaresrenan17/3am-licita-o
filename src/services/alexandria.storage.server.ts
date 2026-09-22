import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Cache em memória para redundância e performance instantânea
const cacheIdsAlexandria = new Set<string>();
let carregadoDoBanco = false;

/**
 * Obtém todos os IDs de licitações atualmente alocadas em Alexandria.
 */
export async function obterIdsAlexandriaServidor(): Promise<string[]> {
  try {
    // 1. Tenta pela tabela dedicada
    const { data, error } = await supabaseAdmin
      .from("licitacoes_alexandria")
      .select("licitacao_id");

    if (!error && Array.isArray(data)) {
      cacheIdsAlexandria.clear();
      for (const row of data) {
        if (row && (row as any).licitacao_id) {
          cacheIdsAlexandria.add(String((row as any).licitacao_id));
        }
      }
      carregadoDoBanco = true;
      return Array.from(cacheIdsAlexandria);
    }
  } catch {
    // Fallback gracioso se a tabela ainda não tiver sido criada no Supabase
  }

  // 2. Se a tabela dedicada ainda não existe, tenta pelo histórico de eventos
  if (!carregadoDoBanco) {
    try {
      const { data: eventos, error: errHist } = await supabaseAdmin
        .from("licitacoes_historico")
        .select("licitacao_id, texto, em")
        .ilike("texto", "%Alexandria%")
        .order("em", { ascending: true });

      if (!errHist && Array.isArray(eventos)) {
        for (const ev of eventos) {
          const id = String(ev.licitacao_id);
          const txt = String(ev.texto ?? "");
          if (txt.includes("Movida para") || txt.includes("acervo de Alexandria")) {
            cacheIdsAlexandria.add(id);
          } else if (txt.includes("Removida de Alexandria")) {
            cacheIdsAlexandria.delete(id);
          }
        }
        carregadoDoBanco = true;
      }
    } catch {
      // continua com cache
    }
  }

  return Array.from(cacheIdsAlexandria);
}

/**
 * Adiciona licitações a Alexandria (move da tela geral para Alexandria).
 */
export async function adicionarLicitacoesAlexandriaServidor(ids: string[]): Promise<boolean> {
  if (!ids || ids.length === 0) return true;

  // Atualiza cache em memória
  for (const id of ids) {
    cacheIdsAlexandria.add(id);
  }

  try {
    // Tenta RPC dedicada
    const { error: rpcError } = await supabaseAdmin.rpc("mover_para_alexandria", {
      p_licitacao_ids: ids,
    });

    if (!rpcError) return true;

    // Se a RPC não existir, tenta insert direto
    const rows = ids.map((id) => ({ licitacao_id: id }));
    const { error: insError } = await supabaseAdmin
      .from("licitacoes_alexandria")
      .upsert(rows, { onConflict: "licitacao_id" });

    if (!insError) return true;
  } catch {
    // Fallback se a tabela ainda não estiver criada no SQL
  }

  // Fallback: registra no histórico
  try {
    const rowsHist = ids.map((id) => ({
      licitacao_id: id,
      origem: "equipe",
      texto: "Movida para o acervo de Alexandria",
    }));
    await supabaseAdmin.from("licitacoes_historico").insert(rowsHist);
  } catch {
    // continua
  }

  return true;
}

/**
 * Remove licitações de Alexandria (devolve para a tela geral de Licitações).
 */
export async function removerLicitacoesAlexandriaServidor(ids: string[]): Promise<boolean> {
  if (!ids || ids.length === 0) return true;

  // Atualiza cache em memória
  for (const id of ids) {
    cacheIdsAlexandria.delete(id);
  }

  try {
    // Tenta RPC dedicada
    const { error: rpcError } = await supabaseAdmin.rpc("remover_de_alexandria", {
      p_licitacao_ids: ids,
    });

    if (!rpcError) return true;

    // Se a RPC não existir, tenta delete direto
    const { error: delError } = await supabaseAdmin
      .from("licitacoes_alexandria")
      .delete()
      .in("licitacao_id", ids);

    if (!delError) return true;
  } catch {
    // Fallback
  }

  // Fallback: registra no histórico
  try {
    const rowsHist = ids.map((id) => ({
      licitacao_id: id,
      origem: "equipe",
      texto: "Removida de Alexandria (devolvida para Licitações Gerais)",
    }));
    await supabaseAdmin.from("licitacoes_historico").insert(rowsHist);
  } catch {
    // continua
  }

  return true;
}
