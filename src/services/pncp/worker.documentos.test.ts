/**
 * Worker da fila de documentos: retomabilidade, pressão sobre a fonte e a
 * distinção entre "sem documento" e "não coletado".
 */
import { describe, expect, it, vi } from "vitest";
import { RecursoInexistentePNCP, RespostaInvalidaPNCP } from "./client.server";
import type { ArquivoPNCP } from "./documentos";
import {
  executarTickDocumentos,
  type LicitacaoParaDocumentos,
  type PortaDocumentos,
} from "./worker.documentos.server";

const cfg = {
  palavras_chave: ["obra", "construção", "pavimentação"],
  score_peso_palavras: 40,
  score_peso_documentos: 30,
  score_peso_valor: 22,
};

const alvo = (n: number, over: Partial<LicitacaoParaDocumentos> = {}): LicitacaoParaDocumentos => ({
  licitacaoId: `lic-${n}`,
  cnpj: "45132495000140",
  ano: 2026,
  sequencial: n,
  objeto: "Construção de creche com pavimentação do entorno",
  modalidadeNome: "Concorrência",
  categoria: "Obra nova",
  valorEstimado: 2_000_000,
  ...over,
});

const doc = (sequencial: number, over: Partial<ArquivoPNCP> = {}): ArquivoPNCP => ({
  url: `https://pncp.gov.br/pncp-api/v1/.../arquivos/${sequencial}`,
  statusAtivo: true,
  dataPublicacaoPncp: "2026-04-10T13:58:25",
  sequencialDocumento: sequencial,
  titulo: "edital.pdf",
  tipoDocumentoNome: "Edital",
  ...over,
});

/**
 * Banco falso: guarda o que foi gravado e devolve lotes programados. `lotes` é
 * consumido em ordem; lote ausente significa fila vazia.
 */
function bancoFalso(lotes: LicitacaoParaDocumentos[][]) {
  const gravacoes: { id: string; documentos: unknown[]; score: number }[] = [];
  const falhas: { id: string; motivo: string; definitiva: boolean }[] = [];
  const liberados: string[] = [];

  const banco: PortaDocumentos = {
    reservar: vi.fn(async (limite: number) => (lotes.shift() ?? []).slice(0, limite)),
    gravar: vi.fn(async (id, documentos, score) => {
      gravacoes.push({ id, documentos, score });
      return { gravados: documentos.length, removidos: 0, ativos: documentos.length };
    }),
    registrarFalha: vi.fn(async (id, motivo, definitiva) => {
      falhas.push({ id, motivo, definitiva });
    }),
    liberar: vi.fn(async (ids: string[]) => {
      liberados.push(...ids);
    }),
  };

  return { banco, gravacoes, falhas, liberados };
}

/** Relógio controlado: cada `dormir` avança o tempo, nenhum teste espera de verdade. */
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

describe("caminho feliz", () => {
  it("coleta, grava e recalcula o score com os documentos encontrados", async () => {
    const { banco, gravacoes } = bancoFalso([[alvo(1)]]);
    const buscar = vi.fn(async () => ({
      status: 200 as const,
      arquivos: [
        doc(1, { tipoDocumentoNome: "Edital" }),
        doc(2, { tipoDocumentoNome: "Outros Documentos", titulo: "PROJ_CRECHE.pdf" }),
        doc(3, { tipoDocumentoNome: "Outros Documentos", titulo: "planilha-orcamentaria.xlsx" }),
      ],
      url: "u",
      tentativas: 1,
      duracaoMs: 50,
    }));

    const r = await executarTickDocumentos({ banco, cfg, buscar, ...relogio() });

    expect(r.licitacoesProcessadas).toBe(1);
    expect(r.documentosGravados).toBe(3);
    expect(r.filaVazia).toBe(true);
    expect(r.erros).toEqual([]);

    expect(gravacoes[0]!.documentos).toHaveLength(3);
    // Edital + projeto + orçamento saturam o peso de documentos (0,5+0,35+0,15),
    // então os 30 pontos entram inteiros: 87 = 27 de palavras (2 de 3) + 30 de
    // documentos + 22 de valor + 8 de modalidade e categoria.
    expect(gravacoes[0]!.score).toBe(87);
  });

  it("documento retirado da fonte é gravado, mas não pontua", async () => {
    /** Roda um tick com os arquivos dados e devolve o score gravado. */
    const scoreCom = async (arquivos: ArquivoPNCP[]) => {
      const { banco, gravacoes } = bancoFalso([[alvo(1)]]);
      await executarTickDocumentos({
        banco,
        cfg,
        buscar: vi.fn(async () => ({
          status: 200 as const,
          arquivos,
          url: "u",
          tentativas: 1,
          duracaoMs: 50,
        })),
        ...relogio(),
      });
      return { score: gravacoes[0]!.score, gravados: gravacoes[0]!.documentos.length };
    };

    const retirado = await scoreCom([
      doc(1, { tipoDocumentoNome: "Outros Documentos", titulo: "PROJETO.pdf", statusAtivo: false }),
    ]);
    const nenhum = await scoreCom([]);
    const vigente = await scoreCom([
      doc(1, { tipoDocumentoNome: "Outros Documentos", titulo: "PROJETO.pdf" }),
    ]);

    // A linha continua no catálogo por rastreabilidade...
    expect(retirado.gravados).toBe(1);
    // ...mas vale o mesmo que não ter documento nenhum.
    expect(retirado.score).toBe(nenhum.score);
    expect(vigente.score).toBeGreaterThan(retirado.score);
  });

  it('lista vazia é "sem documento publicado", não erro', async () => {
    const { banco, gravacoes, falhas } = bancoFalso([[alvo(1)]]);
    const buscar = vi.fn(async () => ({
      status: 200 as const,
      arquivos: [] as ArquivoPNCP[],
      url: "u",
      tentativas: 1,
      duracaoMs: 50,
    }));

    const r = await executarTickDocumentos({ banco, cfg, buscar, ...relogio() });

    expect(r.semDocumentos).toBe(1);
    expect(r.licitacoesProcessadas).toBe(1);
    expect(falhas).toEqual([]);
    // Gravar mesmo vazio é o que marca a cobertura como 'completo'.
    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0]!.documentos).toEqual([]);
  });

  it("fila vazia encerra o tick sem gastar rede", async () => {
    const { banco } = bancoFalso([]);
    const buscar = vi.fn();

    const r = await executarTickDocumentos({ banco, cfg, buscar: buscar as never, ...relogio() });

    expect(r.filaVazia).toBe(true);
    expect(r.licitacoesProcessadas).toBe(0);
    expect(buscar).not.toHaveBeenCalled();
  });
});

describe("falhas", () => {
  it("404 é definitivo e não interrompe as outras licitações", async () => {
    const { banco, falhas, gravacoes } = bancoFalso([[alvo(1), alvo(2)]]);
    const buscar = vi.fn(async (_c: string, _a: number, sequencial: number) => {
      if (sequencial === 1) throw new RecursoInexistentePNCP("Compra não encontrada. 4513…");
      return { status: 200 as const, arquivos: [doc(1)], url: "u", tentativas: 1, duracaoMs: 50 };
    });

    const r = await executarTickDocumentos({ banco, cfg, buscar, ...relogio() });

    expect(falhas).toEqual([
      { id: "lic-1", motivo: expect.stringContaining("Compra não encontrada"), definitiva: true },
    ]);
    expect(gravacoes.map((g) => g.id)).toEqual(["lic-2"]);
    expect(r.licitacoesProcessadas).toBe(1);
  });

  it("corpo inválido é definitivo: não declara coletado nem repete em laço", async () => {
    const { banco, falhas } = bancoFalso([[alvo(1)]]);
    const buscar = vi.fn(async () => {
      throw new RespostaInvalidaPNCP("esperado array de documentos, recebido object");
    });

    await executarTickDocumentos({ banco, cfg, buscar, ...relogio() });

    expect(falhas[0]!.definitiva).toBe(true);
  });

  it("falha transitória encerra o tick e devolve o resto à fila", async () => {
    const { banco, falhas, liberados } = bancoFalso([[alvo(1), alvo(2), alvo(3)]]);
    const buscar = vi.fn(async (_c: string, _a: number, sequencial: number) => {
      if (sequencial === 1) throw new Error("fetch failed: ECONNRESET");
      return { status: 200 as const, arquivos: [doc(1)], url: "u", tentativas: 1, duracaoMs: 50 };
    });

    const r = await executarTickDocumentos({
      banco,
      cfg,
      buscar,
      concorrencia: 1,
      ...relogio(),
    });

    expect(falhas[0]).toMatchObject({ id: "lic-1", definitiva: false });
    // Sem a devolução, lic-2 e lic-3 ficariam presas em 'coletando' até a
    // reserva expirar, e a fila pareceria travada.
    expect(liberados).toEqual(["lic-2", "lic-3"]);
    expect(r.erros).toHaveLength(1);
  });

  it("não reserva um novo lote depois de falha transitória", async () => {
    const { banco } = bancoFalso([[alvo(1)], [alvo(2)]]);
    const buscar = vi.fn(async () => {
      throw new Error("timeout");
    });

    await executarTickDocumentos({ banco, cfg, buscar, concorrencia: 1, ...relogio() });

    expect(banco.reservar).toHaveBeenCalledTimes(1);
  });
});

describe("pressão sobre a fonte e orçamento", () => {
  it("respeita 2 partidas por segundo (arquivo 03 §8)", async () => {
    const { banco } = bancoFalso([[alvo(1), alvo(2), alvo(3), alvo(4)]]);
    const r = relogio();
    const partidas: number[] = [];

    const buscar = vi.fn(async () => {
      partidas.push(r.agora());
      return { status: 200 as const, arquivos: [doc(1)], url: "u", tentativas: 1, duracaoMs: 0 };
    });

    await executarTickDocumentos({ banco, cfg, buscar, agora: r.agora, dormir: r.dormir });

    expect(partidas).toHaveLength(4);
    // Duas partidas simultâneas no instante zero seria furar o limite: cada
    // uma abre sua própria janela de 500 ms.
    for (let i = 1; i < partidas.length; i++) {
      expect(partidas[i]! - partidas[i - 1]!).toBeGreaterThanOrEqual(500);
    }
  });

  it("nunca passa de `concorrencia` requisições em voo", async () => {
    const { banco } = bancoFalso([[alvo(1), alvo(2), alvo(3), alvo(4), alvo(5)]]);
    const r = relogio();
    let emVoo = 0;
    let pico = 0;

    const buscar = vi.fn(async () => {
      pico = Math.max(pico, ++emVoo);
      await Promise.resolve();
      emVoo--;
      return { status: 200 as const, arquivos: [doc(1)], url: "u", tentativas: 1, duracaoMs: 0 };
    });

    await executarTickDocumentos({
      banco,
      cfg,
      buscar,
      concorrencia: 2,
      agora: r.agora,
      dormir: r.dormir,
    });

    expect(pico).toBeLessThanOrEqual(2);
  });

  it("encerra em estado retomável quando o orçamento acaba", async () => {
    const { banco, liberados, gravacoes } = bancoFalso([[alvo(1), alvo(2), alvo(3), alvo(4)]]);
    const r = relogio();

    const buscar = vi.fn(async () => {
      // Cada licitação consome metade do que sobrava depois da reserva.
      r.avancar(3_000);
      return { status: 200 as const, arquivos: [doc(1)], url: "u", tentativas: 1, duracaoMs: 0 };
    });

    const resumo = await executarTickDocumentos({
      banco,
      cfg,
      buscar,
      orcamentoMs: 8_000,
      reservaMs: 2_000,
      concorrencia: 1,
      agora: r.agora,
      dormir: r.dormir,
    });

    expect(resumo.licitacoesProcessadas).toBeGreaterThan(0);
    expect(resumo.licitacoesProcessadas).toBeLessThan(4);
    expect(resumo.filaVazia).toBe(false);
    // Tudo que foi reservado e não coletado volta para a fila.
    expect(gravacoes).toHaveLength(resumo.licitacoesProcessadas);
    expect(liberados).toHaveLength(4 - resumo.licitacoesProcessadas);
  });

  it("para no teto de licitações por tick", async () => {
    const { banco } = bancoFalso([[alvo(1), alvo(2)], [alvo(3)]]);
    const r = relogio();
    const buscar = vi.fn(async () => ({
      status: 200 as const,
      arquivos: [doc(1)],
      url: "u",
      tentativas: 1,
      duracaoMs: 0,
    }));

    const resumo = await executarTickDocumentos({
      banco,
      cfg,
      buscar,
      maxLicitacoesPorTick: 2,
      agora: r.agora,
      dormir: r.dormir,
    });

    expect(resumo.licitacoesProcessadas).toBe(2);
    expect(banco.reservar).toHaveBeenCalledTimes(1);
  });
});
