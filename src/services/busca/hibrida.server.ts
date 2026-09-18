/**
 * Orquestra a busca híbrida: consulta → vetor → RPC → resultado.
 *
 * A regra que não pode ser quebrada: qualquer problema aqui vira busca lexical,
 * nunca erro na cara do usuário. A ADR-001 define o lexical como caminho de
 * rollback, e um provedor de embedding fora do ar é exatamente o caso em que o
 * rollback tem que acontecer sozinho.
 *
 * Sem palavra-chave não há o que vetorizar: filtro puro é trabalho relacional,
 * e chamar o provedor ali seria custo sem retorno.
 */
import { OllamaEmbedder, paraLiteralPg, type Embedder } from "./embedder";

export interface PortaBuscaRpc {
  hibrida(args: Record<string, unknown>): Promise<unknown>;
  lexical(args: Record<string, unknown>): Promise<unknown>;
}

export interface EntradaBusca {
  filtros: Record<string, unknown>;
  limite?: number;
  deslocamento?: number;
  embedder?: Embedder;
  rpc?: PortaBuscaRpc;
}

export interface SaidaBusca {
  itens: unknown[];
  total: number;
  modo: "hibrido" | "lexical";
  /**
   * Instante que o BANCO carimbou, quando ele carimbou. `buscar_licitacoes`
   * devolve `consultado_em`, e o ramo lexical da função híbrida o preserva —
   * descartá-lo aqui obrigaria quem chama a inventar um relógio local no lugar
   * do relógio da consulta. Ausente só no ramo híbrido de verdade.
   */
  consultadoEm?: string;
  /** true quando caiu para o lexical por falha, e não por configuração. */
  degradou: boolean;
}

function normalizar(bruto: unknown, degradou: boolean): SaidaBusca {
  const r = (bruto ?? {}) as {
    itens?: unknown[];
    total?: number;
    modo?: string;
    consultado_em?: string;
  };
  return {
    itens: r.itens ?? [],
    total: r.total ?? 0,
    modo: r.modo === "hibrido" ? "hibrido" : "lexical",
    ...(typeof r.consultado_em === "string" ? { consultadoEm: r.consultado_em } : {}),
    degradou,
  };
}

export async function buscarComSemantica(entrada: EntradaBusca): Promise<SaidaBusca> {
  const { filtros, limite = 25, deslocamento = 0 } = entrada;
  const rpc = entrada.rpc;
  if (!rpc) throw new Error("PortaBuscaRpc é obrigatória");

  const termo = String(filtros["palavra_chave"] ?? "").trim();
  const argsBase = { p_filtros: filtros, p_limite: limite, p_deslocamento: deslocamento };

  if (termo.length === 0) {
    return normalizar(await rpc.lexical(argsBase), false);
  }

  const embedder = entrada.embedder ?? new OllamaEmbedder();

  let literal: string;
  try {
    const [vetor] = await embedder.embed([termo]);
    if (!vetor) throw new Error("provedor devolveu lote vazio");
    literal = paraLiteralPg(vetor);
  } catch {
    return normalizar(await rpc.lexical(argsBase), true);
  }

  try {
    return normalizar(await rpc.hibrida({ ...argsBase, p_embedding: literal }), false);
  } catch {
    return normalizar(await rpc.lexical(argsBase), true);
  }
}
