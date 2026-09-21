import { describe, expect, it, vi } from "vitest";
import { PALAVRAS_CHAVE_PADRAO } from "@/lib/types";
import { ErroContratoPNCP, type ResultadoPagina } from "./client.server";
import type { ContratacaoPNCP } from "./mapper";
import {
  executarTick,
  type EntradaMerge,
  type PortaIngestao,
  type SegmentoPersistido,
} from "./worker.server";

const cfg = {
  palavras_chave: PALAVRAS_CHAVE_PADRAO,
  score_peso_palavras: 45,
  score_peso_documentos: 30,
  score_peso_valor: 17,
};

const contratacao = (n: number): ContratacaoPNCP => ({
  numeroControlePNCP: `00000000000191-1-${String(n).padStart(6, "0")}/2026`,
  orgaoEntidade: { cnpj: "00000000000191", razaoSocial: "PREFEITURA DE EXEMPLO" },
  unidadeOrgao: { ufSigla: "DF", municipioNome: "Brasília", codigoIbge: "5300108" },
  anoCompra: 2026,
  sequencialCompra: n,
  objetoCompra: "Execução de obra de pavimentação asfáltica em vias urbanas",
  modalidadeId: 6,
  modalidadeNome: "Pregão - Eletrônico",
  situacaoCompraId: 1,
  valorTotalEstimado: 1_500_000,
  dataAberturaProposta: "2026-09-10T08:00:00",
  dataEncerramentoProposta: "2026-09-24T10:00:00",
  dataPublicacaoPncp: "2026-09-10T04:00:02",
  dataAtualizacaoGlobal: "2026-09-10T04:01:12",
});

const pagina = (itens: ContratacaoPNCP[], totalPaginas: number): ResultadoPagina => ({
  status: 200,
  envelope: { data: itens, totalPaginas, totalRegistros: itens.length * totalPaginas },
  url: "https://pncp.gov.br/api/consulta/v1/contratacoes/proposta?...",
  tentativas: 1,
  duracaoMs: 10,
});

/**
 * Relógio controlado. Sem isto, o intervalo entre partidas viraria espera real
 * e a suíte inteira passaria a levar segundos por teste.
 */
function relogio(inicio = 0) {
  let t = inicio;
  return {
    agora: () => t,
    dormir: vi.fn(async (ms: number) => {
      t += ms;
    }),
    avancar: (ms: number) => {
      t += ms;
    },
  };
}

/** Banco em memória com o mesmo contrato da RPC de merge. */
function bancoFalso(segmentos: SegmentoPersistido[]) {
  const estado = segmentos.map((s) => ({
    ...s,
    concluido: false,
    falhou: false,
    adiado: false,
    posseToken: null as string | null,
  }));
  const merges: EntradaMerge[] = [];
  const aplicadas = new Map<string, Set<number>>();
  const falhas: { id: string; motivo: string; definitiva: boolean }[] = [];
  let jobStatus: string | null = null;

  const banco: PortaIngestao = {
    async proximoSegmento() {
      // Espelha o `skip locked` do banco: segmento com posse não é reentregue.
      const livre = estado.find((s) => !s.concluido && !s.falhou && !s.adiado && !s.posseToken);
      if (!livre) return null;
      livre.posseToken = `posse-${livre.id}`;
      return livre;
    },
    async liberarSegmento(segmento) {
      const alvo = estado.find((s) => s.id === segmento.id);
      if (alvo) alvo.posseToken = null;
    },
    async mergePagina(entrada) {
      merges.push(entrada);
      const seg = estado.find((s) => s.id === entrada.segmentoId)!;
      const jaAplicadas = aplicadas.get(seg.id) ?? new Set<number>();

      if (jaAplicadas.has(entrada.pagina)) {
        return {
          aplicado: false,
          recebidos: 0,
          novos: 0,
          atualizados: 0,
          ignorados: 0,
          naoAdmitidos: 0,
          proximaPagina: seg.proximaPagina,
          segmentoConcluido: seg.concluido,
        };
      }

      jaAplicadas.add(entrada.pagina);
      aplicadas.set(seg.id, jaAplicadas);
      seg.proximaPagina = entrada.pagina + 1;

      const concluido =
        (entrada.totalPaginas !== null && entrada.pagina >= entrada.totalPaginas) ||
        entrada.linhas.length === 0;
      seg.concluido = concluido;

      return {
        aplicado: true,
        recebidos: entrada.linhas.length,
        novos: entrada.linhas.length,
        atualizados: 0,
        ignorados: 0,
        naoAdmitidos: 0,
        proximaPagina: seg.proximaPagina,
        segmentoConcluido: concluido,
      };
    },
    salvarPayloads: vi.fn(async () => {}),
    async registrarFalhaSegmento(id, motivo, definitiva) {
      falhas.push({ id, motivo, definitiva });
      const alvo = estado.find((s) => s.id === id)!;
      if (definitiva) alvo.falhou = true;
      else alvo.adiado = true;
    },
    async haSegmentosPendentes() {
      return estado.some((s) => !s.concluido && !s.falhou);
    },
    async finalizarJob(_jobId, status) {
      jobStatus = status;
    },
  };

  return { banco, estado, merges, falhas, status: () => jobStatus };
}

const segmento = (id: string): SegmentoPersistido => ({
  id,
  posseToken: null,
  endpoint: "proposta",
  query: { dataFinal: "20261011", uf: "DF", tamanhoPagina: 10 },
  proximaPagina: 1,
  totalPaginasObservado: null,
});

describe("I01 — paginação completa de um segmento", () => {
  it("mede separadamente transformação, payload, merge e administração do banco", async () => {
    const r = relogio();
    const { banco } = bancoFalso([segmento("s1")]);
    const originalProximo = banco.proximoSegmento.bind(banco);
    const originalLiberar = banco.liberarSegmento.bind(banco);
    const originalMerge = banco.mergePagina.bind(banco);

    banco.proximoSegmento = vi.fn(async (jobId: string) => {
      r.avancar(2);
      return originalProximo(jobId);
    });
    banco.liberarSegmento = vi.fn(async (segmentoPersistido: SegmentoPersistido) => {
      r.avancar(3);
      return originalLiberar(segmentoPersistido);
    });
    banco.salvarPayloads = vi.fn(async () => {
      r.avancar(7);
    });
    banco.mergePagina = vi.fn(async (entrada: EntradaMerge) => {
      r.avancar(11);
      return originalMerge(entrada);
    });

    const item = contratacao(1);
    let objeto = item.objetoCompra;
    Object.defineProperty(item, "objetoCompra", {
      get() {
        r.avancar(5);
        return objeto;
      },
      set(valor) {
        objeto = valor;
      },
      enumerable: true,
    });
    const buscar = vi.fn(async () => {
      r.avancar(20);
      return pagina([item], 1);
    });

    const resultado = await executarTick("job-1", {
      banco,
      cfg,
      buscar,
      agora: r.agora,
      dormir: r.dormir,
    });

    expect(resultado.metricasPipeline).toMatchObject({
      transformacaoMs: 5,
      salvarPayloadMs: 7,
      mergeMs: 11,
    });
    expect(resultado.metricasPipeline.administracaoDbMs).toBeGreaterThanOrEqual(5);
    expect(resultado.metricasApi.latenciaTotalMs).toBe(10);
  });

  it("persiste deltas a cada cinco páginas e o restante no epílogo", async () => {
    const { banco } = bancoFalso([segmento("s1")]);
    const registros: Parameters<NonNullable<PortaIngestao["registrarMetricasApi"]>>[] = [];
    banco.registrarMetricasApi = vi.fn(async (jobId, api, pipeline, eventoId) => {
      registros.push([jobId, api, pipeline, eventoId]);
    });
    const buscar = vi.fn(async () => pagina([contratacao(1)], 6));

    await executarTick("job-1", {
      banco,
      cfg,
      buscar,
      intervaloPartidaMs: 0,
      ...relogio(),
    });

    expect(registros).toHaveLength(2);
    expect(registros.map(([, api]) => api.requisicoes)).toEqual([5, 1]);
    expect(registros[0]![3]).not.toBe(registros[1]![3]);
  });

  it("repete o mesmo delta e evento quando o flush intermediário falha", async () => {
    const { banco } = bancoFalso([segmento("s1")]);
    const registros: Parameters<NonNullable<PortaIngestao["registrarMetricasApi"]>>[] = [];
    banco.registrarMetricasApi = vi.fn(async (jobId, api, pipeline, eventoId) => {
      registros.push([jobId, api, pipeline, eventoId]);
      if (registros.length === 1) throw new Error("telemetria indisponível");
    });
    const buscar = vi.fn(async () => pagina([contratacao(1)], 6));

    const resultado = await executarTick("job-1", {
      banco,
      cfg,
      buscar,
      intervaloPartidaMs: 0,
      ...relogio(),
    });

    expect(resultado.paginasAplicadas).toBe(6);
    expect(registros).toHaveLength(3);
    expect(registros[0]![1].requisicoes).toBe(5);
    expect(registros[1]![1].requisicoes).toBe(5);
    expect(registros[0]![3]).toBe(registros[1]![3]);
    expect(registros[2]![1].requisicoes).toBe(1);
    expect(registros[2]![3]).not.toBe(registros[1]![3]);
  });

  it("persiste um tick somente administrativo mesmo sem chamar o PNCP", async () => {
    const r = relogio();
    const { banco } = bancoFalso([]);
    const originalProximo = banco.proximoSegmento.bind(banco);
    banco.proximoSegmento = vi.fn(async (jobId: string) => {
      r.avancar(4);
      return originalProximo(jobId);
    });
    banco.registrarMetricasApi = vi.fn(async () => {});

    const resultado = await executarTick("job-1", {
      banco,
      cfg,
      agora: r.agora,
      dormir: r.dormir,
    });

    expect(resultado.metricasApi.requisicoes).toBe(0);
    expect(banco.registrarMetricasApi).toHaveBeenCalledOnce();
    expect(vi.mocked(banco.registrarMetricasApi).mock.calls[0]![2].administracaoDbMs).toBe(4);
  });

  it("percorre as páginas na ordem, aplica cada uma e conclui o segmento", async () => {
    const { banco, merges, status } = bancoFalso([segmento("s1")]);
    const buscar = vi
      .fn()
      .mockResolvedValueOnce(pagina([contratacao(1), contratacao(2)], 3))
      .mockResolvedValueOnce(pagina([contratacao(3), contratacao(4)], 3))
      .mockResolvedValueOnce(pagina([contratacao(5)], 3));

    const r = await executarTick("job-1", { banco, cfg, buscar, ...relogio() });

    expect(merges.map((m) => m.pagina)).toEqual([1, 2, 3]);
    expect(r.paginasAplicadas).toBe(3);
    expect(r.recebidos).toBe(5);
    expect(r.segmentosConcluidos).toBe(1);
    expect(r.jobConcluido).toBe(true);
    expect(status()).toBe("concluido");
    expect(r.metricasApi).toMatchObject({
      requisicoes: 3,
      sucessos: 3,
      tentativas: 3,
      latenciaTotalMs: 30,
      latenciaMaxMs: 10,
      falhasConsecutivas: 0,
    });
  });

  it("marca o job com erros quando algum registro foi rejeitado", async () => {
    const { banco, status } = bancoFalso([segmento("s1")]);
    // A fonte simplesmente não envia a chave; não envia "undefined".
    const semIdentidade: ContratacaoPNCP = { ...contratacao(9) };
    delete semIdentidade.numeroControlePNCP;
    const buscar = vi.fn().mockResolvedValue(pagina([contratacao(1), semIdentidade], 1));

    const r = await executarTick("job-1", { banco, cfg, buscar, ...relogio() });

    // A linha válida é gravada; a inválida vira evidência, não descarte da página.
    expect(r.recebidos).toBe(1);
    expect(r.erros.join(" ")).toContain("numeroControlePNCP ausente");
    expect(status()).toBe("concluido_com_erros");
  });
});

describe("I02 — 204 sem conteúdo", () => {
  it("encerra o segmento sem gravar linhas e sem tratar como falha", async () => {
    const { banco, merges } = bancoFalso([segmento("s1")]);
    const buscar = vi.fn().mockResolvedValue({
      status: 204,
      envelope: null,
      url: "u",
      tentativas: 1,
      duracaoMs: 5,
    } satisfies ResultadoPagina);

    const r = await executarTick("job-1", { banco, cfg, buscar, ...relogio() });

    expect(merges).toHaveLength(1);
    expect(merges[0]!.linhas).toEqual([]);
    expect(r.segmentosConcluidos).toBe(1);
    expect(r.erros).toEqual([]);
  });
});

describe("I04/R03 — falhas preservam progresso", () => {
  it("falha de contrato encerra só aquele segmento e a coleta segue no próximo", async () => {
    const { banco, falhas } = bancoFalso([segmento("s1"), segmento("s2")]);
    const buscar = vi
      .fn()
      .mockRejectedValueOnce(new ErroContratoPNCP(400, "Tamanho de página inválido"))
      .mockResolvedValueOnce(pagina([contratacao(1)], 1));

    const r = await executarTick("job-1", { banco, cfg, buscar, ...relogio() });

    expect(falhas[0]).toMatchObject({ id: "s1", definitiva: true });
    expect(r.paginasAplicadas).toBe(1);
    expect(r.jobConcluido).toBe(true);
  });

  it("falha transitória adia o segmento sem avançar o checkpoint", async () => {
    const { banco, estado, falhas } = bancoFalso([segmento("s1")]);
    const buscar = vi.fn().mockRejectedValue(new Error("socket hang up"));

    const r = await executarTick("job-1", { banco, cfg, buscar, ...relogio() });

    expect(estado[0]!.proximaPagina).toBe(1);
    expect(falhas[0]).toMatchObject({ definitiva: false });
    expect(r.jobConcluido).toBe(false);
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(r.metricasApi).toMatchObject({
      requisicoes: 1,
      sucessos: 0,
      outras: 1,
      falhasConsecutivas: 1,
    });
  });

  it("continua nas outras modalidades quando um segmento tem falha transitória", async () => {
    const { banco, estado, falhas } = bancoFalso([segmento("s1"), segmento("s2")]);
    const buscar = vi
      .fn()
      .mockRejectedValueOnce(new Error("HTTP 504"))
      .mockResolvedValueOnce(pagina([contratacao(2)], 1));

    const r = await executarTick("job-1", { banco, cfg, buscar, ...relogio() });

    expect(falhas).toEqual([expect.objectContaining({ id: "s1", definitiva: false })]);
    expect(estado[0]).toMatchObject({ proximaPagina: 1, adiado: true });
    expect(estado[1]).toMatchObject({ concluido: true });
    expect(r.paginasAplicadas).toBe(1);
    expect(r.jobConcluido).toBe(false);
    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it("erro ao gravar não avança o checkpoint: a página é relida depois", async () => {
    const { banco, estado } = bancoFalso([segmento("s1")]);
    vi.spyOn(banco, "mergePagina").mockRejectedValueOnce(new Error("banco indisponível"));
    const buscar = vi.fn().mockResolvedValue(pagina([contratacao(1)], 2));

    const r = await executarTick("job-1", { banco, cfg, buscar, ...relogio() });

    expect(estado[0]!.proximaPagina).toBe(1);
    expect(r.paginasAplicadas).toBe(0);
    expect(r.erros[0]).toContain("banco indisponível");
  });
});

describe("I06 — reentrega da mesma página", () => {
  it("não conta duas vezes quando o merge informa que a página já foi aplicada", async () => {
    const { banco, estado } = bancoFalso([segmento("s1")]);
    // Cenário real da reentrega: outro tick já aplicou esta página e encerrou o
    // segmento antes de a mensagem ser confirmada.
    vi.spyOn(banco, "mergePagina").mockImplementation(async () => {
      estado[0]!.concluido = true;
      return {
        aplicado: false,
        recebidos: 0,
        novos: 0,
        atualizados: 0,
        ignorados: 0,
        naoAdmitidos: 0,
        proximaPagina: 2,
        segmentoConcluido: true,
      };
    });
    const buscar = vi.fn().mockResolvedValue(pagina([contratacao(1)], 1));

    const r = await executarTick("job-1", { banco, cfg, buscar, ...relogio() });

    expect(r.paginasAplicadas).toBe(0);
    expect(r.novos).toBe(0);
    expect(r.segmentosConcluidos).toBe(1);
  });
});

describe("orçamento do tick", () => {
  it("para de buscar quando o tempo restante fica abaixo da reserva", async () => {
    const { banco } = bancoFalso([segmento("s1")]);
    let relogio = 0;
    // Cada página consome 8 s do orçamento de 25 s (reserva de 4 s).
    const buscar = vi.fn(async () => {
      relogio += 8_000;
      return pagina([contratacao(1)], 99);
    });

    const r = await executarTick("job-1", {
      banco,
      cfg,
      buscar,
      agora: () => relogio,
      orcamentoMs: 25_000,
      reservaMs: 4_000,
    });

    expect(buscar).toHaveBeenCalledTimes(3);
    expect(r.paginasAplicadas).toBe(3);
    expect(r.jobConcluido).toBe(false);
    expect(r.duracaoMs).toBe(24_000);
  });

  it("respeita o teto de páginas por tick", async () => {
    const { banco } = bancoFalso([segmento("s1")]);
    const buscar = vi.fn(async () => pagina([contratacao(1)], 99));

    const r = await executarTick("job-1", {
      banco,
      cfg,
      buscar,
      maxPaginasPorTick: 2,
      ...relogio(),
    });

    expect(r.paginasAplicadas).toBe(2);
    expect(r.jobConcluido).toBe(false);
  });
});

describe("política de admissão por endpoint", () => {
  const incremental = (id: string): SegmentoPersistido => ({
    id,
    posseToken: null,
    endpoint: "atualizacao",
    query: {
      dataInicial: "20260912",
      dataFinal: "20260915",
      codigoModalidadeContratacao: 6,
      uf: "DF",
      tamanhoPagina: 10,
    },
    proximaPagina: 1,
    totalPaginasObservado: null,
  });

  it("descoberta por propostas grava tudo que chega", async () => {
    const { banco, merges } = bancoFalso([segmento("s1")]);
    const buscar = vi.fn().mockResolvedValue(pagina([contratacao(1)], 1));

    await executarTick("job", {
      banco,
      cfg,
      buscar,
      orcamentoMs: 10_000,
      reservaMs: 0,
      ...relogio(),
    });

    expect(merges[0]!.admissao).toBe("todas");
  });

  it("incremental só admite registro novo com proposta aberta", async () => {
    // A rota de atualização devolve tudo que mudou — metade da janela medida em
    // 15/09/2026 era proposta encerrada. Sem isto o catálogo incharia.
    const { banco, merges } = bancoFalso([incremental("s1")]);
    const buscar = vi.fn().mockResolvedValue(pagina([contratacao(1)], 1));

    await executarTick("job", {
      banco,
      cfg,
      buscar,
      orcamentoMs: 10_000,
      reservaMs: 0,
      ...relogio(),
    });

    expect(merges[0]!.admissao).toBe("abertas");
  });

  it("o que a política recusou é contado à parte, não como 'sem mudança'", async () => {
    const { banco, estado } = bancoFalso([incremental("s1")]);
    const buscar = vi.fn().mockResolvedValue(pagina([contratacao(1)], 1));

    // O mock substitui a lógica do banco falso, então precisa encerrar o
    // segmento por conta própria — senão o tick repete até o teto de páginas.
    vi.spyOn(banco, "mergePagina").mockImplementation(async () => {
      estado[0]!.concluido = true;
      return {
        aplicado: true,
        recebidos: 50,
        novos: 4,
        atualizados: 6,
        ignorados: 17,
        naoAdmitidos: 23,
        proximaPagina: 2,
        segmentoConcluido: true,
      };
    });

    const resumo = await executarTick("job", {
      banco,
      cfg,
      buscar,
      orcamentoMs: 10_000,
      reservaMs: 0,
    });

    expect(resumo.naoAdmitidos).toBe(23);
    expect(resumo.ignorados).toBe(17);
    // Recebidos é o que a fonte mandou, incluindo o que recusamos: a tela
    // precisa poder dizer "de 50 que vieram, 23 não entraram".
    expect(resumo.recebidos).toBe(50);
  });
});

describe("ritmo contra o limitador do PNCP", () => {
  it("aquece com uma vaga e depois mantém duas janelas independentes em voo", async () => {
    const ids = Array.from({ length: 12 }, (_, indice) => `s${indice + 1}`);
    const { banco, merges } = bancoFalso(ids.map(segmento));
    const r = relogio();
    const partidas: number[] = [];
    const resolver: Array<() => void> = [];
    let chamada = 0;

    const buscar = vi.fn(
      () =>
        new Promise<ResultadoPagina>((resolve) => {
          const numero = ++chamada;
          partidas.push(r.agora());
          if (numero <= 10) resolve(pagina([contratacao(numero)], 1));
          else resolver.push(() => resolve(pagina([contratacao(numero)], 1)));
        }),
    );

    const execucao = executarTick("job-1", {
      banco,
      cfg,
      buscar,
      intervaloPartidaMs: 1_500,
      concorrenciaMax: 2,
      agora: r.agora,
      dormir: r.dormir,
    });

    await vi.waitFor(() => expect(buscar).toHaveBeenCalledTimes(12));
    expect(partidas).toHaveLength(12);
    expect(r.dormir).toHaveBeenCalledWith(1_500);
    resolver.forEach((concluir) => concluir());

    const resumo = await execucao;
    expect(new Set(merges.map((m) => m.segmentoId))).toEqual(new Set(ids));
    expect(resumo.metricasApi.concorrenciaMaxObservada).toBe(2);
  });

  it("acelera gradualmente até 2,5 s após respostas limpas", async () => {
    const { banco } = bancoFalso([segmento("s1")]);
    const r = relogio();
    const partidas: number[] = [];

    const buscar = vi.fn(async () => {
      partidas.push(r.agora());
      return pagina([contratacao(partidas.length)], 6);
    });

    const resumo = await executarTick("job-1", {
      banco,
      cfg,
      buscar,
      intervaloPartidaMs: 3_000,
      ritmoAdaptativo: true,
      agora: r.agora,
      dormir: r.dormir,
    });

    expect(partidas).toEqual([0, 3_000, 6_000, 8_750, 11_500, 14_250]);
    expect(resumo.metricasApi.intervaloFinalMs).toBe(2_500);
    expect(resumo.metricasApi.esperaLimitadorMs).toBe(14_250);
  });

  it("desacelera depois de uma página que precisou repetir", async () => {
    const { banco } = bancoFalso([segmento("s1")]);
    const r = relogio();
    const partidas: number[] = [];

    const buscar = vi.fn(async () => {
      partidas.push(r.agora());
      const resposta = pagina([contratacao(partidas.length)], 3);
      return partidas.length === 2
        ? {
            ...resposta,
            tentativas: 2,
            falhas: { timeouts: 0, erros429: 0, erros5xx: 1, outras: 0 },
          }
        : resposta;
    });

    const resumo = await executarTick("job-1", {
      banco,
      cfg,
      buscar,
      intervaloPartidaMs: 3_000,
      ritmoAdaptativo: true,
      agora: r.agora,
      dormir: r.dormir,
    });

    expect(partidas).toEqual([0, 3_000, 7_500]);
    expect(resumo.metricasApi.intervaloFinalMs).toBe(4_500);
    expect(resumo.metricasApi.concorrenciaFinal).toBe(1);
    expect(resumo.metricasApi.erros5xx).toBe(1);
  });

  it("espaça o início das páginas", async () => {
    // Medição de 15/09/2026: a 6ª requisição seguida volta 429, sem
    // Retry-After, e só libera após ~20 s parado. SP tem 101 páginas, então
    // sem ritmo a coleta parava sempre na sexta.
    const { banco } = bancoFalso([segmento("s1")]);
    const r = relogio();
    const partidas: number[] = [];

    const buscar = vi.fn(async () => {
      partidas.push(r.agora());
      return pagina([contratacao(partidas.length)], 4);
    });

    await executarTick("job-1", {
      banco,
      cfg,
      buscar,
      intervaloPartidaMs: 1_500,
      agora: r.agora,
      dormir: r.dormir,
    });

    expect(partidas).toHaveLength(4);
    for (let i = 1; i < partidas.length; i++) {
      expect(partidas[i]! - partidas[i - 1]!).toBeGreaterThanOrEqual(1_500);
    }
  });

  it("não espera quando a própria fonte já demorou mais que o intervalo", async () => {
    // Enquanto o PNCP levava 30–60 s por página, o tempo de resposta já
    // espaçava as chamadas. O limitador não pode somar atraso a isso.
    const { banco } = bancoFalso([segmento("s1")]);
    const r = relogio();

    const buscar = vi.fn(async () => {
      r.avancar(30_000);
      return pagina([contratacao(1)], 2);
    });

    await executarTick("job-1", {
      banco,
      cfg,
      buscar,
      intervaloPartidaMs: 1_500,
      orcamentoMs: 300_000,
      reservaMs: 0,
      agora: r.agora,
      dormir: r.dormir,
    });

    expect(buscar).toHaveBeenCalledTimes(2);
    expect(r.dormir).not.toHaveBeenCalled();
  });

  it("encerra retomável em vez de gastar o tick inteiro numa pausa", async () => {
    const { banco, estado } = bancoFalso([segmento("s1")]);
    const r = relogio();
    const buscar = vi.fn(async () => {
      r.avancar(4_000);
      return pagina([contratacao(1)], 5);
    });

    const resumo = await executarTick("job-1", {
      banco,
      cfg,
      buscar,
      intervaloPartidaMs: 30_000,
      orcamentoMs: 10_000,
      reservaMs: 0,
      agora: r.agora,
      dormir: r.dormir,
    });

    // Uma página entrou; a pausa seguinte não cabia no que restava do tick.
    expect(resumo.paginasAplicadas).toBe(1);
    expect(resumo.jobConcluido).toBe(false);
    expect(estado[0]!.proximaPagina).toBe(2);
  });
});

describe("I07 — posse do segmento", () => {
  it("solta a posse a cada página, senão o job se declara concluído na primeira", async () => {
    // A armadilha: com o segmento preso por nós mesmos, a iteração seguinte não
    // o encontraria, `proximoSegmento` devolveria null e o tick marcaria o job
    // como concluído com uma página gravada.
    const { banco, estado, merges } = bancoFalso([segmento("s1")]);
    const buscar = vi.fn(async () => pagina([contratacao(1)], 3));

    const r = await executarTick("job-1", { banco, cfg, buscar, ...relogio() });

    expect(merges.map((m) => m.pagina)).toEqual([1, 2, 3]);
    expect(r.jobConcluido).toBe(true);
    expect(estado[0]!.posseToken).toBeNull();
  });

  it("solta a posse também quando o segmento falha", async () => {
    const { banco, estado } = bancoFalso([segmento("s1")]);
    const buscar = vi.fn().mockRejectedValue(new Error("ECONNRESET"));

    await executarTick("job-1", { banco, cfg, buscar, ...relogio() });

    // Preso, o segmento só voltaria à fila quando a posse expirasse.
    expect(estado[0]!.posseToken).toBeNull();
  });

  it("um segmento com posse de outro tick não é reentregue", async () => {
    const { banco, estado } = bancoFalso([segmento("s1")]);
    estado[0]!.posseToken = "posse-de-outro-tick";
    const buscar = vi.fn();

    const r = await executarTick("job-1", { banco, cfg, buscar: buscar as never, ...relogio() });

    expect(buscar).not.toHaveBeenCalled();
    // Sem segmento disponível o tick encerra; o outro tick é quem está tocando.
    expect(r.paginasAplicadas).toBe(0);
  });
});

describe("cooldown e resiliência", () => {
  it("sinaliza aguardandoCooldown como true quando o tick para por erro mas há segmentos pendentes", async () => {
    const { banco } = bancoFalso([segmento("s1")]);
    banco.haSegmentosPendentes = vi.fn(async () => true);
    const buscar = vi.fn().mockRejectedValue(new Error("ECONNRESET"));

    const r = await executarTick("job-1", { banco, cfg, buscar, ...relogio() });

    expect(r.paginasAplicadas).toBe(0);
    expect(r.jobConcluido).toBe(false);
    expect(r.aguardandoCooldown).toBe(true);
    expect(r.erros.length).toBeGreaterThan(0);
  });
});

