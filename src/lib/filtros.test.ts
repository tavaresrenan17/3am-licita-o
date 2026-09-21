import { describe, expect, it } from "vitest";
import { filtrosVazios, type FiltrosLicitacoes } from "./types";
import {
  DEFINICOES,
  SEM_CONTROLE,
  contarFiltrosAtivos,
  definicoesDoGrupo,
  filtrosDaBusca,
  paramsDaBusca,
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

  it("tri distingue sim, nao e indiferente", () => {
    const d = DEFINICOES.find((x) => x.chave === "prioridade")!;
    expect(d.descrever("sim")).toBe("Prioritárias");
    expect(d.descrever("nao")).toBe("Não prioritárias");
    // Indiferente não é o mesmo que não: "" (vazio) é um terceiro estado.
    // A geração de chips pula valores vazios, mas a função está errada se
    // transforma "" em "Não prioritárias" — mistura semântica com apresentação.
    expect(d.descrever("")).toBe("Qualquer prioridade");
  });

  it("moeda sai formatada", () => {
    const d = DEFINICOES.find((x) => x.chave === "valor_min")!;
    expect(d.descrever("50000")).toContain("50.000");
  });

  it("status_interno sai formatado com rotulo legivel", () => {
    const d = DEFINICOES.find((x) => x.chave === "status_interno")!;
    expect(d.descrever("interessante")).toBe("Status: Interessante");
    expect(d.descrever("em_analise")).toBe("Status: Em análise");
    expect(d.descrever("descartada")).toBe("Status: Descartada");
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

  it("usa diaBR para respeitar o fuso de São Paulo, não Date local", () => {
    // 02:00 UTC do dia 19 é 23:00 do dia 18 em São Paulo. Uma implementação
    // ingênua com `Date` local acerta numa máquina em BRT e erra numa máquina
    // em UTC — e o workflow do GitHub roda em UTC. Este caso trava a resposta
    // correta nos dois lugares. Se alguém reverter para Date.getDate(), o teste
    // falha em máquinas UTC, detectando a regressão na CI.
    const r = presetPrazo(0, new Date("2026-09-19T02:00:00Z"));
    expect(r.limite_de).toBe("2026-09-18");
  });
});

describe("contarFiltrosAtivos", () => {
  it("conta os filtros novos, que a lista escrita a mao ignorava", () => {
    // O cenário exato do defeito: vindo do Dashboard com `recomendadas` e
    // `categoria`, mais "Com edital" marcado na tela. Contador antigo: 0.
    const filtros = {
      ...filtrosVazios,
      uf: "SP",
      recomendadas: true,
      categoria: "Obras",
      com_edital: true,
    };
    expect(contarFiltrosAtivos(filtros, "SP")).toBe(3);
  });

  it("nao conta o recorte inicial do catalogo, mas conta a troca de UF", () => {
    expect(contarFiltrosAtivos({ ...filtrosVazios, uf: "SP" }, "SP")).toBe(0);
    expect(contarFiltrosAtivos({ ...filtrosVazios, uf: "MG" }, "SP")).toBe(1);
  });

  it("nao conta `apenas_abertas`, que o servidor impoe", () => {
    // `filtrosVazios` já traz `apenas_abertas: true`; contá-lo faria a tela
    // nascer com um filtro ativo que ninguém escolheu.
    expect(contarFiltrosAtivos(filtrosVazios, "")).toBe(0);
  });

  it("conta toda chave descrita, e nao uma lista paralela", () => {
    // Se alguém acrescentar um filtro em DEFINICOES, ele passa a contar sem
    // ninguém precisar lembrar de um quarto lugar.
    const todos = { ...filtrosVazios } as FiltrosLicitacoes;
    for (const def of DEFINICOES) {
      (todos[def.chave] as string | boolean) =
        typeof filtrosVazios[def.chave] === "boolean" ? true : "x";
    }
    expect(contarFiltrosAtivos(todos, "")).toBe(DEFINICOES.length);
  });
});

describe("link da busca (ida e volta)", () => {
  const cheios: FiltrosLicitacoes = {
    palavra_chave: "pavimentação",
    uf: "SP",
    municipio: "Campinas",
    orgao: "Prefeitura",
    modalidade: "Pregão Eletrônico",
    valor_min: "50000",
    valor_max: "900000",
    publicacao_de: "2026-01-01",
    publicacao_ate: "2026-02-01",
    criadas_de: "2026-03-01",
    limite_de: "2026-09-19",
    limite_ate: "2026-09-30",
    status_interno: "nova",
    prioridade: "sim",
    categoria: "Pavimentação",
    com_edital: true,
    com_projeto: true,
    com_orcamento: true,
    nao_analisadas: true,
    recomendadas: true,
    apenas_abertas: true,
  };

  it("nao perde NENHUM filtro na ida e na volta", () => {
    // O defeito: o botão serializava tudo, o schema da rota conhecia seis
    // chaves e o zod descartava o resto sem erro — a palavra-chave, que dá
    // nome ao botão, era a primeira a cair.
    const params = paramsDaBusca(cheios);
    const lidos = Object.fromEntries(params.entries());
    expect(filtrosDaBusca(lidos, "SP")).toEqual(cheios);
  });

  it("leva ordenacao e direcao, que o schema aceitava e o botao nao enviava", () => {
    const params = paramsDaBusca(cheios, "valor_estimado", "desc");
    expect(params.get("ordenar")).toBe("valor_estimado");
    expect(params.get("direcao")).toBe("desc");
  });

  it("nao escreve filtro vazio na URL", () => {
    const params = paramsDaBusca({ ...filtrosVazios, uf: "SP" });
    expect([...params.keys()].sort()).toEqual(["apenas_abertas", "uf"]);
  });

  it("aceita booleano como `true` e como a string 'true'", () => {
    // O roteador faz JSON.parse de cada parâmetro: `com_edital=true` chega
    // booleano, mas um link montado à mão chega string. Significam o mesmo.
    expect(filtrosDaBusca({ com_edital: true }, "SP").com_edital).toBe(true);
    expect(filtrosDaBusca({ com_edital: "true" }, "SP").com_edital).toBe(true);
    expect(filtrosDaBusca({ com_edital: "false" }, "SP").com_edital).toBe(false);
  });

  it("cai no recorte inicial quando o link nao traz UF", () => {
    expect(filtrosDaBusca({}, "SP").uf).toBe("SP");
    expect(filtrosDaBusca({ uf: "MG" }, "SP").uf).toBe("MG");
  });

  it("ignora chave que nao e filtro", () => {
    const r = filtrosDaBusca({ ordenar: "valor_estimado", direcao: "desc", uf: "RJ" }, "SP");
    expect(r).toEqual({ ...filtrosVazios, uf: "RJ" });
  });
});
