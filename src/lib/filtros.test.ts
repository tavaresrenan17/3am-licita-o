import { describe, expect, it } from "vitest";
import { filtrosVazios, type FiltrosLicitacoes } from "./types";
import {
  DEFINICOES,
  GRUPOS_ABERTOS,
  SEM_CONTROLE,
  definicoesDoGrupo,
  presetPrazo,
} from "./filtros";

describe("DEFINICOES", () => {
  it("cobre TODA chave de FiltrosLicitacoes", () => {
    // Esta é a regressão que este trabalho conserta: nove filtros existiam no
    // banco e nunca chegaram à tela. Se alguém acrescentar um filtro novo e
    // esquecer a interface, é aqui que aparece.
    const descritas = new Set(DEFINICOES.map((d) => d.chave));
    const orfas = (Object.keys(filtrosVazios) as (keyof FiltrosLicitacoes)[]).filter(
      (k) => !descritas.has(k) && !SEM_CONTROLE.has(k),
    );
    expect(orfas).toEqual([]);
  });

  it("nao descreve filtro que o servidor impoe", () => {
    // `apenas_abertas` é forçado true em toda requisição; um controle mentiria.
    expect(SEM_CONTROLE.has("apenas_abertas")).toBe(true);
    expect(DEFINICOES.some((d) => d.chave === "apenas_abertas")).toBe(false);
  });

  it("nao tem chave repetida", () => {
    expect(new Set(DEFINICOES.map((d) => d.chave)).size).toBe(DEFINICOES.length);
  });

  it("poe os nove filtros que faltavam nos grupos certos", () => {
    const grupoDe = (c: string) => DEFINICOES.find((d) => d.chave === c)?.grupo;
    expect(grupoDe("com_edital")).toBe("documentos");
    expect(grupoDe("com_projeto")).toBe("documentos");
    expect(grupoDe("com_orcamento")).toBe("documentos");
    expect(grupoDe("limite_de")).toBe("prazo");
    expect(grupoDe("limite_ate")).toBe("prazo");
    expect(grupoDe("criadas_de")).toBe("prazo");
    expect(grupoDe("recomendadas")).toBe("fluxo");
    expect(grupoDe("nao_analisadas")).toBe("fluxo");
    expect(grupoDe("prioridade")).toBe("fluxo");
  });

  it("abre so os grupos onde a decisao de triagem acontece", () => {
    expect([...GRUPOS_ABERTOS].sort()).toEqual(["fluxo", "prazo"]);
  });
});

describe("descrever", () => {
  it("booleano vira o proprio rotulo, sem 'sim'", () => {
    const d = DEFINICOES.find((x) => x.chave === "com_edital")!;
    expect(d.descrever(true)).toBe("Com edital");
  });

  it("data sai no formato brasileiro", () => {
    const d = DEFINICOES.find((x) => x.chave === "limite_ate")!;
    expect(d.descrever("2026-09-30")).toBe("Encerra até 30/09/2026");
  });

  it("tri distingue sim de nao", () => {
    const d = DEFINICOES.find((x) => x.chave === "prioridade")!;
    expect(d.descrever("sim")).toBe("Prioritárias");
    expect(d.descrever("nao")).toBe("Não prioritárias");
  });

  it("moeda sai formatada", () => {
    const d = DEFINICOES.find((x) => x.chave === "valor_min")!;
    expect(d.descrever("50000")).toContain("50.000");
  });
});

describe("definicoesDoGrupo", () => {
  it("devolve so o grupo pedido e nao devolve vazio", () => {
    const docs = definicoesDoGrupo("documentos");
    expect(docs.length).toBe(3);
    expect(docs.every((d) => d.grupo === "documentos")).toBe(true);
  });
});

describe("presetPrazo", () => {
  it("monta a faixa de hoje ate hoje mais N dias", () => {
    const r = presetPrazo(7, new Date("2026-09-19T12:00:00"));
    expect(r.limite_de).toBe("2026-09-19");
    expect(r.limite_ate).toBe("2026-09-26");
  });

  it("atravessa a virada de mes", () => {
    const r = presetPrazo(15, new Date("2026-09-25T12:00:00"));
    expect(r.limite_ate).toBe("2026-10-10");
  });
});
