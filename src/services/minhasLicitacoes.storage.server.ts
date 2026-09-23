import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Cache em memória para redundância e performance instantânea
const cacheIdsMinhasLicitacoes = new Set<string>();
let carregadoDoBanco = false;

/**
 * Obtém todos os IDs de licitações atualmente alocadas em Minhas Licitações.
 */
export async function obterIdsMinhasLicitacoesServidor(): Promise<string[]> {
  try {
    // 1. Tenta pela tabela dedicada
    const { data, error } = await supabaseAdmin.from("minhas_licitacoes").select("licitacao_id");

    if (!error && Array.isArray(data)) {
      cacheIdsMinhasLicitacoes.clear();
      for (const row of data) {
        if (row && (row as any).licitacao_id) {
          cacheIdsMinhasLicitacoes.add(String((row as any).licitacao_id));
        }
      }
      carregadoDoBanco = true;
      return Array.from(cacheIdsMinhasLicitacoes);
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
        .ilike("texto", "%Minhas Licitações%")
        .order("em", { ascending: true });

      if (!errHist && Array.isArray(eventos)) {
        for (const ev of eventos) {
          const id = String(ev.licitacao_id);
          const txt = String(ev.texto ?? "");
          if (txt.includes("Movida para Minhas Licitações")) {
            cacheIdsMinhasLicitacoes.add(id);
          } else if (txt.includes("Removida de Minhas Licitações")) {
            cacheIdsMinhasLicitacoes.delete(id);
          }
        }
        carregadoDoBanco = true;
      }
    } catch {
      // continua com cache
    }
  }

  return Array.from(cacheIdsMinhasLicitacoes);
}

/**
 * Adiciona licitações a Minhas Licitações (move da tela geral para Minhas Licitações).
 */
export async function adicionarMinhasLicitacoesServidor(ids: string[]): Promise<boolean> {
  if (!ids || ids.length === 0) return true;

  // Atualiza cache em memória
  for (const id of ids) {
    cacheIdsMinhasLicitacoes.add(id);
  }

  try {
    // Tenta RPC dedicada
    const { error: rpcError } = await supabaseAdmin.rpc("mover_para_minhas_licitacoes", {
      p_licitacao_ids: ids,
    });

    if (!rpcError) return true;

    // Se a RPC não existir, tenta insert direto
    const rows = ids.map((id) => ({ licitacao_id: id }));
    const { error: insError } = await supabaseAdmin
      .from("minhas_licitacoes")
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
      texto: "Movida para Minhas Licitações",
    }));
    await supabaseAdmin.from("licitacoes_historico").insert(rowsHist);
  } catch {
    // continua
  }

  return true;
}

/**
 * Remove licitações de Minhas Licitações (devolve para a tela geral de Licitações).
 */
export async function removerMinhasLicitacoesServidor(ids: string[]): Promise<boolean> {
  if (!ids || ids.length === 0) return true;

  // Atualiza cache em memória
  for (const id of ids) {
    cacheIdsMinhasLicitacoes.delete(id);
  }

  try {
    // Tenta RPC dedicada
    const { error: rpcError } = await supabaseAdmin.rpc("remover_de_minhas_licitacoes", {
      p_licitacao_ids: ids,
    });

    if (!rpcError) return true;

    // Se a RPC não existir, tenta delete direto
    const { error: delError } = await supabaseAdmin
      .from("minhas_licitacoes")
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
      texto: "Removida de Minhas Licitações (devolvida para Licitações Gerais)",
    }));
    await supabaseAdmin.from("licitacoes_historico").insert(rowsHist);
  } catch {
    // continua
  }

  return true;
}
