import { describe, expect, it } from "vitest";
import { sincronizacaoEstaAtualizada } from "./format";

describe("sincronizacaoEstaAtualizada", () => {
  const agora = Date.parse("2026-09-16T15:00:00.000Z");

  it("aceita uma sincronização concluída dentro da tolerância", () => {
    expect(sincronizacaoEstaAtualizada("concluido", "2026-09-16T10:00:00.000Z", agora)).toBe(true);
  });

  it("marca como desatualizada depois de seis horas", () => {
    expect(sincronizacaoEstaAtualizada("concluido", "2026-09-16T08:59:59.000Z", agora)).toBe(false);
  });

  it.each(["parcial", "falhou", "concluido_com_erros", "em_andamento"])(
    "não considera o status %s como atualizado",
    (status) => {
      expect(sincronizacaoEstaAtualizada(status, "2026-09-16T14:00:00.000Z", agora)).toBe(false);
    },
  );
});
