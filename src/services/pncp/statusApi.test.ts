import { describe, expect, it, vi } from "vitest";
import {
  classificarSonda,
  LIMITE_LENTA_MS,
  sondar,
  urlSondaConsulta,
  verificarStatusPncp,
} from "./statusApi";

const resp = (corpo: string | object | null, status = 200, tipo = "application/json") =>
  new Response(corpo === null ? null : typeof corpo === "string" ? corpo : JSON.stringify(corpo), {
    status,
    headers: { "content-type": tipo },
  });

const relogio = (...instantes: number[]) => {
  const fila = [...instantes];
  return () => fila.shift() ?? instantes[instantes.length - 1];
};

describe("classificarSonda", () => {
  it("resposta válida e rápida é online", () => {
    expect(classificarSonda({ httpStatus: 200, latenciaMs: 700, corpoValido: true }).estado).toBe(
      "online",
    );
  });

  it("resposta válida acima do limite é lenta", () => {
    const r = classificarSonda({
      httpStatus: 200,
      latenciaMs: LIMITE_LENTA_MS + 1,
      corpoValido: true,
    });
    expect(r.estado).toBe("lenta");
  });

  it("204 sem conteúdo conta como resposta válida", () => {
    expect(classificarSonda({ httpStatus: 204, latenciaMs: 500, corpoValido: true }).estado).toBe(
      "online",
    );
  });

  it("timeout e falha de rede são fora do ar", () => {
    expect(classificarSonda({ httpStatus: null, latenciaMs: 15_000, erro: "timeout" }).estado).toBe(
      "fora_do_ar",
    );
    expect(classificarSonda({ httpStatus: null, latenciaMs: 40, erro: "rede" }).estado).toBe(
      "fora_do_ar",
    );
  });

  // No PNCP, 5xx é o sinal de saturação ("Erro na comunicação com o banco de dados").
  it("5xx é fora do ar", () => {
    const r = classificarSonda({ httpStatus: 503, latenciaMs: 200, corpoValido: false });
    expect(r.estado).toBe("fora_do_ar");
    expect(r.detalhe).toContain("503");
  });

  it("200 com corpo que não é o esperado (página de proxy) é fora do ar", () => {
    expect(classificarSonda({ httpStatus: 200, latenciaMs: 300, corpoValido: false }).estado).toBe(
      "fora_do_ar",
    );
  });

  it("429 e 4xx inesperado são instáveis: a fonte está de pé, mas recusando", () => {
    expect(classificarSonda({ httpStatus: 429, latenciaMs: 20, corpoValido: false }).estado).toBe(
      "instavel",
    );
    expect(classificarSonda({ httpStatus: 400, latenciaMs: 90, corpoValido: false }).estado).toBe(
      "instavel",
    );
  });
});

describe("sondar", () => {
  const validarLista = (c: unknown) => Array.isArray(c);

  it("mede a latência e valida o corpo", async () => {
    const fetchImpl = vi.fn(async () => resp([{ id: 1 }])) as unknown as typeof fetch;
    const r = await sondar("https://x", validarLista, {
      fetchImpl,
      agora: relogio(1_000, 1_250),
    });
    expect(r).toMatchObject({ estado: "online", httpStatus: 200, latenciaMs: 250 });
  });

  it("corpo HTML com 200 vira fora do ar", async () => {
    const fetchImpl = vi.fn(async () =>
      resp("<html>manutenção</html>", 200, "text/html"),
    ) as unknown as typeof fetch;
    const r = await sondar("https://x", validarLista, { fetchImpl, agora: relogio(0, 100) });
    expect(r.estado).toBe("fora_do_ar");
  });

  it("204 não tenta ler JSON", async () => {
    const fetchImpl = vi.fn(async () => resp(null, 204)) as unknown as typeof fetch;
    const r = await sondar("https://x", validarLista, { fetchImpl, agora: relogio(0, 100) });
    expect(r.estado).toBe("online");
  });

  it("aborto pelo prazo vira timeout", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, rejeitar) => {
          init?.signal?.addEventListener("abort", () =>
            rejeitar(new DOMException("aborted", "AbortError")),
          );
        }),
    ) as unknown as typeof fetch;
    const r = await sondar("https://x", validarLista, { fetchImpl, timeoutMs: 10 });
    expect(r.estado).toBe("fora_do_ar");
    expect(r.detalhe).toMatch(/sem resposta/i);
  });

  it("erro de rede vira fora do ar", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const r = await sondar("https://x", validarLista, { fetchImpl, agora: relogio(0, 30) });
    expect(r).toMatchObject({ estado: "fora_do_ar", httpStatus: null });
  });
});

describe("verificarStatusPncp", () => {
  it("sonda Consulta e Integração de forma independente", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes("/consulta/")
        ? resp("erro", 500, "text/plain")
        : resp([{ id: 1, nome: "Leilão" }]),
    ) as unknown as typeof fetch;

    const r = await verificarStatusPncp({ fetchImpl });
    expect(r.consulta.estado).toBe("fora_do_ar");
    expect(r.integracao.estado).toBe("online");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("urlSondaConsulta", () => {
  it("consulta uma UF pequena, uma página mínima e prazo futuro", () => {
    const url = new URL(urlSondaConsulta(new Date("2026-09-23T12:00:00Z")));
    expect(url.pathname).toBe("/api/consulta/v1/contratacoes/proposta");
    expect(url.searchParams.get("uf")).toBe("AC");
    expect(url.searchParams.get("tamanhoPagina")).toBe("10");
    expect(url.searchParams.get("dataFinal")).toBe("20260930");
  });
});
