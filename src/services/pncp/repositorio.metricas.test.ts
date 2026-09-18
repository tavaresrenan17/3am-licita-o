import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc },
}));

import { portaIngestao } from "./repositorio.server";
import type { MetricasApiTick, MetricasPipelineTick } from "./worker.server";

const api: MetricasApiTick = {
  requisicoes: 1,
  sucessos: 1,
  tentativas: 1,
  timeouts: 0,
  erros429: 0,
  erros5xx: 0,
  outras: 0,
  latenciaTotalMs: 12,
  latenciaMaxMs: 12,
  falhasConsecutivas: 0,
  reiniciarFalhasConsecutivas: true,
  esperaLimitadorMs: 0,
  intervaloFinalMs: 3_500,
  concorrenciaMaxObservada: 1,
  concorrenciaFinal: 1,
};

const pipeline: MetricasPipelineTick = {
  transformacaoMs: 2,
  salvarPayloadMs: 3,
  mergeMs: 4,
  administracaoDbMs: 5,
};

describe("rollout das métricas do pipeline", () => {
  beforeEach(() => rpc.mockReset());

  it("usa a RPC legada quando a função nova ainda não existe", async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } })
      .mockResolvedValueOnce({ data: null, error: null });

    await portaIngestao().registrarMetricasApi!("job-1", api, pipeline, "evento-1");

    expect(rpc.mock.calls.map(([nome]) => nome)).toEqual([
      "pncp_registrar_metricas_pipeline",
      "pncp_registrar_metricas_api",
    ]);
    expect(rpc.mock.calls[0]![1]).toMatchObject({
      p_evento_id: "evento-1",
      p_transformacao_ms: 2,
      p_merge_ms: 4,
    });
    expect(rpc.mock.calls[1]![1]).not.toHaveProperty("p_evento_id");
  });

  it("não chama a RPC legada quando a nova grava com sucesso", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });

    await portaIngestao().registrarMetricasApi!("job-1", api, pipeline, "evento-1");

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      "pncp_registrar_metricas_pipeline",
      expect.objectContaining({ p_evento_id: "evento-1" }),
    );
  });
});
