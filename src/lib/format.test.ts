import { describe, expect, it } from "vitest";
import { brl, dataBR, formatarMoedaBRL, parseMoeda, sincronizacaoEstaAtualizada } from "./format";

describe("formatarMoedaBRL e parseMoeda", () => {
  it("formata números inteiros e decimais com padrão R$ 000.000.000,00", () => {
    expect(formatarMoedaBRL(1000000)).toBe("R$ 1.000.000,00");
    expect(formatarMoedaBRL(50000.5)).toBe("R$ 50.000,50");
    expect(formatarMoedaBRL("50000")).toBe("R$ 50.000,00");
    expect(formatarMoedaBRL("1000000")).toBe("R$ 1.000.000,00");
    expect(formatarMoedaBRL("1.000.000,00")).toBe("R$ 1.000.000,00");
  });

  it("converte strings monetárias variadas para número", () => {
    expect(parseMoeda("R$ 1.000.000,00")).toBe(1000000);
    expect(parseMoeda("1.000.000,00")).toBe(1000000);
    expect(parseMoeda("1000000")).toBe(1000000);
    expect(parseMoeda("50000,50")).toBe(50000.5);
    expect(parseMoeda("50000.50")).toBe(50000.5);
    expect(parseMoeda("")).toBeNull();
    expect(parseMoeda(null)).toBeNull();
    expect(parseMoeda(undefined)).toBeNull();
  });

  it("brl devolve 'Não informado' para valores vazios/nulos e formata corretamente", () => {
    expect(brl(null)).toBe("Não informado");
    expect(brl(undefined)).toBe("Não informado");
    expect(brl("")).toBe("Não informado");
    expect(brl(0)).toBe("R$ 0,00");
    expect(brl(120684000)).toBe("R$ 120.684.000,00");
    expect(brl("120684000")).toBe("R$ 120.684.000,00");
  });
});

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

describe("dataBR", () => {
  it("interpreta data pura em fuso de São Paulo, não UTC", () => {
    // O bug era pré-existente: `new Date("2026-09-30")` é meia-noite UTC, que em
    // São Paulo (UTC-3) é 21h do dia anterior (29º). Sem este teste, o off-by-one
    // só aparecia em chips de filtro, onde o usuário vê a data formatada. O fix
    // acrescenta "T12:00:00Z" a strings sem hora, garantindo que o dia é preservado
    // quando convertido para São Paulo.
    expect(dataBR("2026-09-30")).toBe("30/09/2026");
  });

  it("formata timestamp com hora no fuso de São Paulo como antes", () => {
    // Prova que o fix não quebrou o caminho que já funcionava para timestamps
    // com componente de hora (que sempre foram interpretados corretamente em UTC).
    expect(dataBR("2026-09-30T23:30:00Z")).toBe("30/09/2026");
  });

  it("degrada para travessão em vez de LANÇAR com data invalida", () => {
    // `Intl.DateTimeFormat.format` lança RangeError com data inválida, e
    // `dataBR` roda dentro do render de quatro rotas: uma exceção derrubaria a
    // página inteira onde antes saía "Invalid Date" numa célula.
    expect(() => dataBR("lixo")).not.toThrow();
    expect(dataBR("lixo")).toBe("—");
    expect(dataBR("2026-13-45")).toBe("—");
  });

  it("vazio e nulo continuam virando travessão", () => {
    expect(dataBR("")).toBe("—");
    expect(dataBR(null)).toBe("—");
    expect(dataBR(undefined)).toBe("—");
  });
});
