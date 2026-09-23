import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import { proximaFalhaSegmento } from "./repositorio.server";

describe("cooldown de segmento após falha transitória", () => {
  it("conta só as falhas seguidas: página gravada depois da última falha zera a sequência", () => {
    // Estado medido em 23/09/2026: modalidade 6 com 17 páginas gravadas e 8
    // falhas espalhadas pelo job. O merge limpa `ultimo_erro`, mas não mexia em
    // `tentativas`, e o segmento levava o teto de 15 min a cada soluço.
    expect(proximaFalhaSegmento({ tentativas: 8, ultimo_erro: null })).toEqual({
      tentativas: 1,
      esperaMs: 15_000,
    });
  });

  it("escala enquanto as falhas continuam sem nenhuma página no meio", () => {
    expect(proximaFalhaSegmento({ tentativas: 1, ultimo_erro: "timeout" }).esperaMs).toBe(30_000);
    expect(proximaFalhaSegmento({ tentativas: 2, ultimo_erro: "timeout" }).esperaMs).toBe(60_000);
  });

  it("não passa de 1 min, para sondar a fonte a tempo de pegar as janelas curtas em que ela volta", () => {
    // 23/09/2026: a fonte ficou saudável por 1,5 a 4 min de cada vez (09:18,
    // 12:17, 14:22, 14:53). Sondando a cada 5 min, a volta era percebida tarde
    // ou nem era percebida. Enquanto a fonte está fora cada sonda é uma única
    // requisição, então uma por minuto não pesa para o PNCP.
    expect(proximaFalhaSegmento({ tentativas: 3, ultimo_erro: "timeout" }).esperaMs).toBe(60_000);
    expect(proximaFalhaSegmento({ tentativas: 20, ultimo_erro: "timeout" }).esperaMs).toBe(60_000);
  });

  it("segmento que nunca falhou começa pela primeira espera", () => {
    expect(proximaFalhaSegmento(null)).toEqual({ tentativas: 1, esperaMs: 15_000 });
  });
});
