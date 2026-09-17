import { describe, expect, it } from "vitest";
import {
  dataFinalHorizonte,
  descreverEscopo,
  planejarIncremental,
  somarDias,
  ultimaDataFechavel,
  EscopoInvalidoError,
  planejarPropostasAbertas,
} from "./planner";

const AGORA = new Date("2026-09-11T17:00:00.000Z"); // 14h em Brasília

describe("C04/C05 — união de segmentos em vez de OR nativo", () => {
  it("cria um segmento por UF quando a modalidade não é restringida", () => {
    const segs = planejarPropostasAbertas(
      { ufs: ["SP", "MG"], modalidades: [], horizonteDias: 30 },
      AGORA,
    );

    expect(segs).toHaveLength(2);
    expect(segs.map((s) => s.params.uf)).toEqual(["MG", "SP"]);
    expect(segs.every((s) => s.params.codigoModalidadeContratacao === undefined)).toBe(true);
  });

  it("faz o produto UF × modalidade quando as duas dimensões têm recorte", () => {
    const segs = planejarPropostasAbertas(
      { ufs: ["SP", "MG"], modalidades: [6, 8], horizonteDias: 30 },
      AGORA,
    );

    expect(segs).toHaveLength(4);
    expect(segs.map((s) => `${s.params.uf}/${s.params.codigoModalidadeContratacao}`)).toEqual([
      "MG/6",
      "MG/8",
      "SP/6",
      "SP/8",
    ]);
  });

  it("nunca emite lista em um parâmetro escalar", () => {
    const segs = planejarPropostasAbertas(
      { ufs: ["SP", "MG"], modalidades: [6, 8], horizonteDias: 30 },
      AGORA,
    );
    for (const s of segs) {
      expect(s.params.uf).toMatch(/^[A-Z]{2}$/);
      expect(typeof s.params.codigoModalidadeContratacao).toBe("number");
    }
  });

  it("recusa UF vazia para não iniciar coleta nacional por acidente", () => {
    expect(() =>
      planejarPropostasAbertas({ ufs: [], modalidades: [], horizonteDias: 30 }, AGORA),
    ).toThrow(/ao menos uma UF/);
  });

  it("remove duplicados e ignora diferença de caixa e espaços", () => {
    const segs = planejarPropostasAbertas(
      { ufs: ["sp", "SP", " sp "], modalidades: [6, 6], horizonteDias: 30 },
      AGORA,
    );
    expect(segs).toHaveLength(1);
    expect(segs[0]!.params.uf).toBe("SP");
  });
});

describe("horizonte no calendário de Brasília", () => {
  it("soma os dias sobre a data local, atravessando o mês", () => {
    expect(dataFinalHorizonte(AGORA, 30)).toBe("20261011");
    expect(dataFinalHorizonte(AGORA, 0)).toBe("20260911");
  });

  it("usa o dia de Brasília, não o de UTC, perto da meia-noite", () => {
    // 02:30 UTC de 12/09 ainda é 23:30 de 11/09 em Brasília.
    expect(dataFinalHorizonte(new Date("2026-09-12T02:30:00.000Z"), 1)).toBe("20260912");
  });

  it("atravessa a virada de ano", () => {
    expect(dataFinalHorizonte(new Date("2026-12-20T15:00:00.000Z"), 30)).toBe("20270119");
  });

  it("recusa horizonte inválido", () => {
    expect(() =>
      planejarPropostasAbertas({ ufs: ["SP"], modalidades: [], horizonteDias: 0 }, AGORA),
    ).toThrow(EscopoInvalidoError);
  });
});

describe("carga progressiva percebida pelo usuário", () => {
  it("processa 5, 15 e 30 dias nessa ordem para cada modalidade", () => {
    const segs = planejarPropostasAbertas(
      {
        ufs: ["SP"],
        modalidades: [4, 6],
        horizonteDias: 30,
        etapasHorizonteDias: [5, 15, 30],
      },
      AGORA,
    );

    expect(segs).toHaveLength(6);
    expect(segs.map((s) => s.params.dataFinal)).toEqual([
      "20260916",
      "20260916",
      "20260926",
      "20260926",
      "20261011",
      "20261011",
    ]);
    expect(segs.map((s) => s.prioridade)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it("cria apenas 1 segmento por modalidade em período único selecionado", () => {
    const segs = planejarPropostasAbertas(
      {
        ufs: ["SP"],
        modalidades: [4, 6],
        horizonteDias: 15,
        etapasHorizonteDias: [15],
      },
      AGORA,
    );

    expect(segs).toHaveLength(2);
    expect(segs.every((s) => s.params.dataFinal === "20260926")).toBe(true);
  });

  it("usa capacidade máxima de página (50) nas modalidades", () => {
    const segs = planejarPropostasAbertas(
      { ufs: ["SP"], modalidades: [4, 6], horizonteDias: 5 },
      AGORA,
    );

    expect(segs.find((s) => s.params.codigoModalidadeContratacao === 4)?.params.tamanhoPagina).toBe(
      50,
    );
    expect(segs.find((s) => s.params.codigoModalidadeContratacao === 6)?.params.tamanhoPagina).toBe(
      50,
    );
  });
});

describe("I10 — assinatura do segmento", () => {
  it("é estável independentemente da ordem digitada", () => {
    const a = planejarPropostasAbertas(
      { ufs: ["MG", "SP"], modalidades: [8, 6], horizonteDias: 30 },
      AGORA,
    );
    const b = planejarPropostasAbertas(
      { ufs: ["SP", "MG"], modalidades: [6, 8], horizonteDias: 30 },
      AGORA,
    );
    expect(a.map((s) => s.assinatura)).toEqual(b.map((s) => s.assinatura));
  });

  it("muda quando o horizonte ou o tamanho de página muda", () => {
    const base = planejarPropostasAbertas(
      { ufs: ["SP"], modalidades: [], horizonteDias: 30 },
      AGORA,
    )[0]!;
    const outroHorizonte = planejarPropostasAbertas(
      { ufs: ["SP"], modalidades: [], horizonteDias: 60 },
      AGORA,
    )[0]!;
    const outroTamanho = planejarPropostasAbertas(
      { ufs: ["SP"], modalidades: [], horizonteDias: 30, tamanhoPagina: 10 },
      AGORA,
    )[0]!;

    expect(base.assinatura).not.toBe(outroHorizonte.assinatura);
    expect(base.assinatura).not.toBe(outroTamanho.assinatura);
  });
});

describe("descreverEscopo", () => {
  it("não chama um horizonte de 30 dias de 'todas as abertas'", () => {
    const texto = descreverEscopo({ ufs: ["SP"], modalidades: [], horizonteDias: 30 });
    expect(texto).toBe("SP · todas as modalidades · propostas encerrando nos próximos 30 dias");
  });

  it("não exibe 'etapas' quando for período único selecionado", () => {
    const texto5 = descreverEscopo({
      ufs: ["SP"],
      modalidades: [],
      horizonteDias: 5,
      etapasHorizonteDias: [5],
    });
    expect(texto5).toBe("SP · todas as modalidades · propostas encerrando nos próximos 5 dias");

    const texto30 = descreverEscopo({
      ufs: ["SP"],
      modalidades: [],
      horizonteDias: 30,
      etapasHorizonteDias: [30],
    });
    expect(texto30).toBe("SP · todas as modalidades · propostas encerrando nos próximos 30 dias");
  });

  it("exibe etapas apenas quando houver múltiplos períodos configurados", () => {
    const texto = descreverEscopo({
      ufs: ["SP"],
      modalidades: [],
      horizonteDias: 30,
      etapasHorizonteDias: [5, 15, 30],
    });
    expect(texto).toBe(
      "SP · todas as modalidades · etapas 5/15/30 dias · propostas encerrando nos próximos 30 dias",
    );
  });
});

describe("incremental por atualização global (Fase 3)", () => {
  // 15/09/2026 às 10h de Brasília. Instante fixo: o plano não pode depender
  // do relógio de quem roda o teste.
  const AGORA = new Date("2026-09-15T13:00:00Z");
  const base = { ufs: ["DF"], modalidades: [6], inicioPadrao: "2026-09-01" };

  /** AAAAMMDD do PNCP → AAAA-MM-DD, para comparar com a aritmética de calendário. */
  const paraIso = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

  it("usa o endpoint de atualização, com modalidade e as duas datas", () => {
    const [s] = planejarIncremental({ ...base, janelaDias: 7 }, [], AGORA);

    expect(s!.endpoint).toBe("atualizacao");
    expect(s!.params.codigoModalidadeContratacao).toBe(6);
    expect(s!.params.dataInicial).toMatch(/^\d{8}$/);
    expect(s!.params.dataFinal).toMatch(/^\d{8}$/);
    expect(s!.params.uf).toBe("DF");
  });

  it("recusa escopo sem modalidade: a rota a exige, ao contrário de /proposta", () => {
    expect(() => planejarIncremental({ ...base, modalidades: [] }, [], AGORA)).toThrow(
      EscopoInvalidoError,
    );
  });

  it("sem cobertura, parte do início padrão recuado pela sobreposição", () => {
    const segs = planejarIncremental({ ...base, sobreposicaoDias: 2, janelaDias: 7 }, [], AGORA);
    // 2026-09-01 menos 2 dias de sobreposição.
    expect(segs[0]!.params.dataInicial).toBe("20260830");
  });

  it("com cobertura, parte do dia seguinte ao último fechado, menos a sobreposição", () => {
    const segs = planejarIncremental(
      { ...base, sobreposicaoDias: 2, janelaDias: 7 },
      [{ uf: "DF", modalidadeId: 6, ultimaDataFechada: "2026-09-10" }],
      AGORA,
    );
    // Seguinte a 10 é 11; menos 2 de sobreposição dá 09.
    expect(segs[0]!.params.dataInicial).toBe("20260909");
    expect(segs).toHaveLength(1);
  });

  it("as janelas são disjuntas, cobrem até hoje e nenhuma passa do tamanho pedido", () => {
    const segs = planejarIncremental(
      { ...base, inicioPadrao: "2026-08-20", sobreposicaoDias: 0, janelaDias: 7 },
      [],
      AGORA,
    );

    // Tupla, não string[]: o índice fixo precisa ser `string`, não `string | undefined`.
    const janelas = segs.map((s) => [s.params.dataInicial!, s.params.dataFinal!] as const);
    expect(janelas[0]![0]).toBe("20260820");
    expect(janelas.at(-1)![1]).toBe("20260915");

    for (const [de, ate] of janelas) {
      expect(Number(ate)).toBeGreaterThanOrEqual(Number(de));
    }
    // Sem buraco nem sobreposição acidental entre janelas consecutivas.
    for (let i = 1; i < janelas.length; i++) {
      expect(somarDias(paraIso(janelas[i - 1]![1]), 1)).toBe(paraIso(janelas[i]![0]));
    }
  });

  it("nunca pede janela que comece depois de hoje", () => {
    const segs = planejarIncremental(
      { ...base, sobreposicaoDias: 0, janelaDias: 7 },
      [{ uf: "DF", modalidadeId: 6, ultimaDataFechada: "2026-09-20" }],
      AGORA,
    );
    expect(segs).toHaveLength(1);
    expect(segs[0]!.params.dataInicial).toBe("20260915");
    expect(segs[0]!.params.dataFinal).toBe("20260915");
  });

  it("multiplica por UF e modalidade, porque os parâmetros são escalares", () => {
    const segs = planejarIncremental(
      {
        ufs: ["DF", "SP"],
        modalidades: [4, 6, 8],
        inicioPadrao: "2026-09-14",
        sobreposicaoDias: 0,
      },
      [],
      AGORA,
    );
    // 2 UFs × 3 modalidades × 1 janela.
    expect(segs).toHaveLength(6);
    expect(new Set(segs.map((s) => s.assinatura)).size).toBe(6);
  });

  it("cada partição avança no seu próprio ritmo", () => {
    const segs = planejarIncremental(
      {
        ufs: ["DF"],
        modalidades: [4, 6],
        inicioPadrao: "2026-09-14",
        sobreposicaoDias: 0,
        janelaDias: 7,
      },
      [{ uf: "DF", modalidadeId: 6, ultimaDataFechada: "2026-09-14" }],
      AGORA,
    );

    const porModalidade = new Map(
      segs.map((s) => [s.params.codigoModalidadeContratacao, s.params.dataInicial]),
    );
    expect(porModalidade.get(4)).toBe("20260914");
    // A modalidade 6 já estava coberta até 14: começa em 15.
    expect(porModalidade.get(6)).toBe("20260915");
  });

  it("recusa UF vazia para o incremental não expandir para o Brasil inteiro", () => {
    expect(() =>
      planejarIncremental({ ufs: [], modalidades: [6], inicioPadrao: "2026-09-15" }, [], AGORA),
    ).toThrow(/ao menos uma UF/);
  });

  it("mudar a janela muda a assinatura: checkpoint antigo não é reaproveitado", () => {
    const a = planejarIncremental({ ...base, janelaDias: 7, sobreposicaoDias: 0 }, [], AGORA);
    const b = planejarIncremental({ ...base, janelaDias: 3, sobreposicaoDias: 0 }, [], AGORA);
    expect(a[0]!.assinatura).not.toBe(b[0]!.assinatura);
  });

  it("recusa janela fora do intervalo de 1 a 7 dias", () => {
    expect(() => planejarIncremental({ ...base, janelaDias: 0 }, [], AGORA)).toThrow(/1 a 7/);
    expect(() => planejarIncremental({ ...base, janelaDias: 30 }, [], AGORA)).toThrow(/1 a 7/);
  });
});

describe("ultimaDataFechavel", () => {
  const HOJE = "2026-09-15";

  it("janela inteiramente no passado fecha até o seu fim", () => {
    expect(ultimaDataFechavel("2026-09-01", "2026-09-07", HOJE)).toBe("2026-09-07");
  });

  it("janela que alcança hoje fecha só até ontem", () => {
    // O dia corrente ainda vai receber atualizações na fonte.
    expect(ultimaDataFechavel("2026-09-09", "2026-09-15", HOJE)).toBe("2026-09-14");
  });

  it("janela que cobre apenas hoje não fecha dia nenhum", () => {
    expect(ultimaDataFechavel("2026-09-15", "2026-09-15", HOJE)).toBeNull();
  });
});
