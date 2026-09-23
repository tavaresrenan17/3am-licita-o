import { describe, expect, it } from "vitest";
import { decidirProximoTick, fonteSegueInstavel, type ResumoParaConducao } from "./conducao";

type ResumoParcial = Omit<Partial<ResumoParaConducao>, "metricasApi"> & {
  metricasApi?: Partial<ResumoParaConducao["metricasApi"]>;
};

const resumo = (parcial: ResumoParcial = {}): ResumoParaConducao => ({
  jobConcluido: false,
  paginasAplicadas: 0,
  aguardandoCooldown: false,
  proximaTentativaEmMs: null,
  erros: [],
  ...parcial,
  metricasApi: { requisicoes: 0, falhasConsecutivas: 0, ...parcial.metricasApi },
});

const opcoes = { falhasSeguidas: 0, limiteFalhas: 6, restanteJanelaMs: Infinity };

describe("condução dos ticks de uma sincronização", () => {
  it("conclui quando o worker declara o job concluído", () => {
    expect(decidirProximoTick(resumo({ jobConcluido: true }), opcoes)).toEqual({
      acao: "concluir",
    });
  });

  it("segue imediatamente e zera as falhas quando alguma página foi gravada", () => {
    expect(
      decidirProximoTick(resumo({ paginasAplicadas: 3 }), { ...opcoes, falhasSeguidas: 4 }),
    ).toEqual({ acao: "seguir", esperaMs: 0, falhasSeguidas: 0 });
  });

  it("espera o cooldown inteiro sem contar como falha quando só há segmentos em espera", () => {
    // Log de 23/09/2026 09:30: segmento em cooldown de 13 min, e o script
    // desistiu depois de cinco ticks de 5 s — a próxima chance era 3 h depois.
    const d = decidirProximoTick(
      resumo({
        aguardandoCooldown: true,
        proximaTentativaEmMs: 13 * 60_000,
        erros: ["Segmentos aguardando nova tentativa após falha temporária do PNCP."],
      }),
      { ...opcoes, falhasSeguidas: 2 },
    );
    expect(d).toEqual({ acao: "seguir", esperaMs: 13 * 60_000 + 1_000, falhasSeguidas: 2 });
  });

  it("conta como falha o tick que chamou o PNCP e não gravou nada", () => {
    const d = decidirProximoTick(
      resumo({
        aguardandoCooldown: true,
        proximaTentativaEmMs: 15_000,
        erros: ["s1: HTTP 504"],
        metricasApi: { requisicoes: 2 },
      }),
      { ...opcoes, falhasSeguidas: 1 },
    );
    expect(d).toEqual({ acao: "seguir", esperaMs: 16_000, falhasSeguidas: 2 });
  });

  it("pausa para retomada ao atingir o limite de ticks falhos seguidos", () => {
    const d = decidirProximoTick(
      resumo({ erros: ["s1: HTTP 504"], metricasApi: { requisicoes: 2 } }),
      { ...opcoes, falhasSeguidas: 5 },
    );
    expect(d).toMatchObject({ acao: "pausar" });
    expect(d.acao === "pausar" && d.motivo).toContain("HTTP 504");
  });

  it("pausa quando a espera não cabe no que resta da janela do agendador", () => {
    const d = decidirProximoTick(
      resumo({ aguardandoCooldown: true, proximaTentativaEmMs: 600_000 }),
      {
        ...opcoes,
        restanteJanelaMs: 300_000,
      },
    );
    expect(d).toMatchObject({ acao: "pausar" });
  });

  it("com a janela como único limite, segue sondando depois de muitas falhas", () => {
    const d = decidirProximoTick(
      resumo({
        proximaTentativaEmMs: 300_000,
        erros: ["s1: HTTP 504"],
        metricasApi: { requisicoes: 1 },
      }),
      { falhasSeguidas: 20, limiteFalhas: Infinity, restanteJanelaMs: 3_600_000 },
    );
    expect(d).toEqual({ acao: "seguir", esperaMs: 301_000, falhasSeguidas: 21 });
  });

  it("a fonte segue instável quando a última chamada do tick falhou", () => {
    const falhou = resumo({ metricasApi: { requisicoes: 2, falhasConsecutivas: 1 } });
    expect(fonteSegueInstavel(falhou, false)).toBe(true);
  });

  it("a fonte deixa de ser instável quando a última chamada do tick respondeu", () => {
    const respondeu = resumo({ metricasApi: { requisicoes: 3, falhasConsecutivas: 0 } });
    expect(fonteSegueInstavel(respondeu, true)).toBe(false);
  });

  it("tick que só esperou cooldown, sem chamar o PNCP, mantém o que já se sabia", () => {
    const soEsperou = resumo({ aguardandoCooldown: true });
    expect(fonteSegueInstavel(soEsperou, true)).toBe(true);
    expect(fonteSegueInstavel(soEsperou, false)).toBe(false);
  });

  it("sem previsão de cooldown, espera um intervalo curto", () => {
    expect(decidirProximoTick(resumo({ aguardandoCooldown: true }), opcoes)).toEqual({
      acao: "seguir",
      esperaMs: 5_000,
      falhasSeguidas: 0,
    });
  });
});
