import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  buscarArquivos,
  buscarPagina,
  esperaDoRetryAfter,
  ErroContratoPNCP,
  FalhaTransitoriaPNCP,
  RecursoInexistentePNCP,
  RespostaInvalidaPNCP,
} from "./client.server";

const envelopeReal = readFileSync(
  new URL("./__fixtures__/probe-publicacao_valida.json", import.meta.url),
  "utf8",
);

const jsonResp = (corpo: string | object, status = 200) =>
  new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Encadeia respostas: cada chamada consome a próxima da lista. */
const fetchFalso = (respostas: (Response | Error)[]) => {
  const impl = vi.fn(async () => {
    const proxima = respostas.shift();
    if (!proxima) throw new Error("fetch chamado mais vezes que o esperado");
    if (proxima instanceof Error) throw proxima;
    return proxima;
  });
  return impl as unknown as typeof fetch & { mock: { calls: unknown[] } };
};

const params = { dataFinal: "20261011", uf: "DF", pagina: 1, tamanhoPagina: 10 };

const base = (fetchImpl: typeof fetch, extras = {}) => ({
  fetchImpl,
  dormir: vi.fn(async () => {}),
  aleatorio: () => 0.5,
  ...extras,
});

describe("caminho feliz", () => {
  it("devolve o envelope e a contagem de tentativas", async () => {
    const opts = base(fetchFalso([jsonResp(envelopeReal)]));
    const r = await buscarPagina("proposta", params, opts);

    expect(r.status).toBe(200);
    expect(r.envelope?.data).toHaveLength(10);
    expect(r.envelope?.totalRegistros).toBe(32);
    expect(r.tentativas).toBe(1);
    expect(r.url).toContain("/contratacoes/proposta?dataFinal=20261011");
  });

  it("valida o contrato antes da rede: parâmetro inválido não gera requisição", async () => {
    const impl = fetchFalso([]);
    await expect(
      buscarPagina("proposta", { ...params, tamanhoPagina: 51 }, base(impl)),
    ).rejects.toThrow(/tamanhoPagina/);
    expect((impl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });
});

describe("I02/I03 — 204 e corpos inesperados", () => {
  it("trata 204 sem tentar ler JSON", async () => {
    const resposta204 = new Response(null, { status: 204 });
    const espiaJson = vi.spyOn(resposta204, "json");

    const r = await buscarPagina("proposta", params, base(fetchFalso([resposta204])));

    expect(r.status).toBe(204);
    expect(r.envelope).toBeNull();
    expect(espiaJson).not.toHaveBeenCalled();
  });

  it("recusa HTML de proxy devolvido com status 200", async () => {
    const html = new Response("<html><body>502 Bad Gateway</body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
    await expect(buscarPagina("proposta", params, base(fetchFalso([html])))).rejects.toThrow(
      RespostaInvalidaPNCP,
    );
  });

  it("recusa JSON malformado e envelope sem data", async () => {
    await expect(
      buscarPagina("proposta", params, base(fetchFalso([jsonResp("{ não é json")]))),
    ).rejects.toThrow(RespostaInvalidaPNCP);

    await expect(
      buscarPagina("proposta", params, base(fetchFalso([jsonResp({ totalRegistros: 3 })]))),
    ).rejects.toThrow(/data/);
  });

  it("recusa metadados contraditórios (página diferente da pedida)", async () => {
    const corpo = { data: [], numeroPagina: 7, totalPaginas: 9 };
    await expect(
      buscarPagina("proposta", params, base(fetchFalso([jsonResp(corpo)]))),
    ).rejects.toThrow(/página 7/);
  });

  it("aceita vazio coerente (data vazia com empty)", async () => {
    const corpo = { data: [], totalRegistros: 0, totalPaginas: 0, numeroPagina: 1, empty: true };
    const r = await buscarPagina("proposta", params, base(fetchFalso([jsonResp(corpo)])));
    expect(r.envelope?.data).toEqual([]);
  });
});

describe("R01/R03 — falhas HTTP", () => {
  it("não repete 400: falha de contrato é definitiva", async () => {
    const impl = fetchFalso([jsonResp({ message: "Tamanho de página inválido" }, 400)]);
    await expect(buscarPagina("proposta", params, base(impl))).rejects.toThrow(ErroContratoPNCP);
    expect((impl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("respeita Retry-After em segundos no 429", async () => {
    const dormir = vi.fn(async () => {});
    const resp429 = new Response("", { status: 429, headers: { "retry-after": "2" } });
    const opts = base(fetchFalso([resp429, jsonResp(envelopeReal)]), { dormir });

    const r = await buscarPagina("proposta", params, opts);

    expect(dormir).toHaveBeenCalledWith(2000);
    expect(r.tentativas).toBe(2);
    expect(r.falhas?.erros429).toBe(1);
  });

  it("entende Retry-After como data HTTP", () => {
    const agora = Date.parse("2026-09-11T17:00:00.000Z");
    expect(esperaDoRetryAfter("Fri, 11 Sep 2026 17:00:30 GMT", agora)).toBe(30_000);
    expect(esperaDoRetryAfter("valor estranho", agora)).toBeNull();
    expect(esperaDoRetryAfter(null, agora)).toBeNull();
  });

  it("faz backoff em 503 e conclui quando a fonte volta", async () => {
    const dormir = vi.fn(async () => {});
    const opts = base(fetchFalso([jsonResp({}, 503), jsonResp(envelopeReal)]), { dormir });

    const r = await buscarPagina("proposta", params, opts);

    expect(dormir).toHaveBeenCalledTimes(1);
    expect(r.status).toBe(200);
    expect(r.falhas?.erros5xx).toBe(1);
  });

  it("repete timeout até o limite e então falha de forma observável", async () => {
    const timeouts = Array.from({ length: 3 }, () => {
      const e = new Error("The operation was aborted");
      e.name = "AbortError";
      return e;
    });
    const opts = base(fetchFalso(timeouts), { tentativasMax: 3 });

    try {
      await buscarPagina("proposta", params, opts);
      expect.unreachable("a consulta deveria falhar");
    } catch (erro) {
      expect(erro).toBeInstanceOf(FalhaTransitoriaPNCP);
      expect((erro as FalhaTransitoriaPNCP).falhas.timeouts).toBe(3);
      expect((erro as FalhaTransitoriaPNCP).message).toContain("Tempo limite esgotado");
    }
  });

  it("trata 504 Gateway Time-out com mensagem amigável e contabiliza falha 5xx", async () => {
    const html504 = new Response("<html><body><h1>504 Gateway Time-out</h1></body></html>", {
      status: 504,
      headers: { "content-type": "text/html" },
    });
    const opts = base(fetchFalso([html504]), { tentativasMax: 1 });

    try {
      await buscarPagina("proposta", params, opts);
      expect.unreachable("a consulta deveria falhar");
    } catch (erro) {
      expect(erro).toBeInstanceOf(FalhaTransitoriaPNCP);
      expect((erro as FalhaTransitoriaPNCP).falhas.erros5xx).toBe(1);
      expect((erro as FalhaTransitoriaPNCP).message).toContain("504 Gateway Time-out");
    }
  });

  it("não dorme além do orçamento do tick", async () => {
    const dormir = vi.fn(async () => {});
    const resp429 = new Response("", { status: 429, headers: { "retry-after": "120" } });
    const opts = base(fetchFalso([resp429]), { dormir, orcamentoMs: 25_000 });

    await expect(buscarPagina("proposta", params, opts)).rejects.toThrow(/orçamento/);
    expect(dormir).not.toHaveBeenCalled();
  });
});

describe("/arquivos — metadados de documentos", () => {
  // Item real da sondagem de 14/09/2026.
  const doc = {
    uri: "https://pncp.gov.br/pncp-api/v1/orgaos/45132495000140/compras/2026/206/arquivos/1",
    url: "https://pncp.gov.br/pncp-api/v1/orgaos/45132495000140/compras/2026/206/arquivos/1",
    statusAtivo: true,
    dataPublicacaoPncp: "2026-04-10T13:58:25",
    sequencialDocumento: 1,
    titulo: "edital.pdf",
    tipoDocumentoNome: "Edital",
    tipoDocumentoId: 2,
  };

  it("lê o array puro devolvido pela base de Integração", async () => {
    const r = await buscarArquivos(
      "45132495000140",
      2026,
      206,
      base(fetchFalso([jsonResp([doc])])),
    );

    expect(r.status).toBe(200);
    expect(r.arquivos).toHaveLength(1);
    expect(r.arquivos[0]?.titulo).toBe("edital.pdf");
    expect(r.url).toBe(
      "https://pncp.gov.br/api/pncp/v1/orgaos/45132495000140/compras/2026/206/arquivos",
    );
  });

  it("array vazio é resposta legítima, não erro", async () => {
    const r = await buscarArquivos("45132495000140", 2026, 206, base(fetchFalso([jsonResp([])])));
    expect(r.status).toBe(200);
    expect(r.arquivos).toEqual([]);
  });

  it("recusa envelope no lugar do array: a rota teria mudado", async () => {
    await expect(
      buscarArquivos("45132495000140", 2026, 206, base(fetchFalso([jsonResp({ data: [doc] })]))),
    ).rejects.toThrow(RespostaInvalidaPNCP);
  });

  it('404 "Compra não encontrada" é definitivo: não repete a requisição', async () => {
    const impl = fetchFalso([
      jsonResp({ status: "404", message: "Compra não encontrada. 45132495000140" }, 404),
    ]);
    await expect(buscarArquivos("45132495000140", 2026, 999999, base(impl))).rejects.toThrow(
      RecursoInexistentePNCP,
    );
    expect((impl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("valida o identificador antes da rede", async () => {
    const impl = fetchFalso([]);
    await expect(buscarArquivos("123", 2026, 1, base(impl))).rejects.toThrow(/cnpj/);
    expect((impl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("reaproveita o backoff da listagem: 503 e depois sucesso", async () => {
    const r = await buscarArquivos(
      "45132495000140",
      2026,
      206,
      base(fetchFalso([jsonResp("", 503), jsonResp([doc])])),
    );
    expect(r.tentativas).toBe(2);
    expect(r.arquivos).toHaveLength(1);
  });
});
