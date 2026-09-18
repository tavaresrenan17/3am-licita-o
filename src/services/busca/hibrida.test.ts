import { describe, expect, it } from "vitest";
import { EmbedderFalso } from "./embedder";
import { buscarComSemantica, type PortaBuscaRpc } from "./hibrida.server";

function rpcFalsa(
  resposta: unknown,
  capturar?: (args: Record<string, unknown>) => void,
): PortaBuscaRpc {
  return {
    async hibrida(args) {
      capturar?.(args);
      return resposta;
    },
    async lexical() {
      return { itens: [{ id: "lex" }], total: 1, modo: "lexical" };
    },
  };
}

describe("buscarComSemantica", () => {
  it("embute a palavra-chave e manda o literal para a RPC híbrida", async () => {
    let recebido: Record<string, unknown> = {};
    const saida = await buscarComSemantica({
      filtros: { palavra_chave: "reforma de escola" },
      embedder: new EmbedderFalso(),
      rpc: rpcFalsa({ itens: [{ id: "a" }], total: 1, modo: "hibrido" }, (a) => (recebido = a)),
    });
    expect(String(recebido["p_embedding"])).toMatch(/^\[/);
    expect(saida.modo).toBe("hibrido");
    expect(saida.degradou).toBe(false);
  });

  it("sem palavra-chave não chama o provedor de embedding", async () => {
    let chamou = false;
    const embedder = new EmbedderFalso();
    embedder.embed = async (t) => {
      chamou = true;
      return new EmbedderFalso().embed(t);
    };
    const saida = await buscarComSemantica({
      filtros: { uf: "SP" },
      embedder,
      rpc: rpcFalsa({ itens: [], total: 0, modo: "hibrido" }),
    });
    expect(chamou).toBe(false);
    expect(saida.modo).toBe("lexical");
    expect(saida.degradou).toBe(false);
  });

  it("provedor fora do ar cai para o lexical em vez de estourar", async () => {
    const embedder = new EmbedderFalso();
    embedder.embed = async () => {
      throw new Error("ECONNREFUSED");
    };
    const saida = await buscarComSemantica({
      filtros: { palavra_chave: "escola" },
      embedder,
      rpc: rpcFalsa({ itens: [], total: 0, modo: "hibrido" }),
    });
    expect(saida.modo).toBe("lexical");
    expect(saida.degradou).toBe(true);
    expect(saida.itens).toEqual([{ id: "lex" }]);
  });

  it("falha da RPC híbrida também cai para o lexical", async () => {
    const rpc: PortaBuscaRpc = {
      async hibrida() {
        throw new Error("função não existe");
      },
      async lexical() {
        return { itens: [{ id: "lex" }], total: 1, modo: "lexical" };
      },
    };
    const saida = await buscarComSemantica({
      filtros: { palavra_chave: "escola" },
      embedder: new EmbedderFalso(),
      rpc,
    });
    expect(saida.modo).toBe("lexical");
    expect(saida.degradou).toBe(true);
  });
});
