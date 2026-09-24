import { describe, expect, it, vi } from "vitest";
import { executarAnaliseLicitacao } from "./orquestrador.server";
import type { GeradorChat } from "./gerador.server";
import type {
  RepositorioAnalise,
  LinhaAnalise,
  MateriaPrimaAnalise,
} from "./repositorio.analise.server";
import type { Embedder } from "../busca/embedder";
import { PROMPT_VERSAO } from "./contrato";
import { respostaV3 } from "./__fixtures__/respostaV3";

function criarMockResultadoValido(fonteId: string) {
  return JSON.stringify(respostaV3(fonteId));
}

function repoComAnaliseSalva(promptVersao: string) {
  return {
    obterMateriaPrima: vi.fn().mockResolvedValue({
      licitacao: { id: "lic-salva", objeto: "Mobiliário" },
      documentos: [
        {
          documentoId: "doc-1",
          ativo: true,
          estado: "extraido",
          texto: "Texto do edital",
          nome: "edital.pdf",
          tipoDocumento: "edital",
          sha256: "hash-1",
        },
      ],
      chunksDisponiveis: 0,
    } as MateriaPrimaAnalise),
    obterAnalise: vi.fn().mockResolvedValue({
      licitacaoId: "lic-salva",
      estado: "pronta",
      promptVersao,
      resultado: { veredito: "favoravel" },
    } as unknown as LinhaAnalise),
    adquirirLease: vi.fn().mockResolvedValue({ adquirido: true, linha: null, leaseId: "lease-1" }),
    concluir: vi.fn().mockResolvedValue(undefined),
  } satisfies Partial<RepositorioAnalise>;
}

describe("executarAnaliseLicitacao", () => {
  it("cache válido não chama embedder nem modelo de chat", async () => {
    const embedderMock: Embedder = {
      modelo: "bge-m3",
      versao: "1",
      dimensoes: 1024,
      embed: vi.fn(),
    };
    const geradorMock: GeradorChat = {
      modelo: "gpt-4o-mini",
      gerar: vi.fn(),
    };
    const repoMock: Partial<RepositorioAnalise> = {
      obterMateriaPrima: vi.fn().mockResolvedValue({
        licitacao: { id: "lic-1", objeto: "Reforma" },
        documentos: [
          {
            documentoId: "doc-1",
            ativo: true,
            estado: "extraido",
            texto: "Texto do edital",
            nome: "edital.pdf",
            tipoDocumento: "edital",
            sha256: "hash-1",
          },
        ],
        chunksDisponiveis: 5,
      } as MateriaPrimaAnalise),
      obterAnalise: vi.fn().mockResolvedValue({
        licitacaoId: "lic-1",
        estado: "pronta",
        resultado: { veredito: "favoravel" },
      } as unknown as LinhaAnalise),
    };

    const resultado = await executarAnaliseLicitacao({
      licitacaoId: "lic-1",
      forcar: false,
      repositorio: repoMock as RepositorioAnalise,
      embedder: embedderMock,
      gerador: geradorMock,
    });

    expect(resultado.estado).toBe("pronta");
    expect(embedderMock.embed).not.toHaveBeenCalled();
    expect(geradorMock.gerar).not.toHaveBeenCalled();
  });

  it("sem texto não chama modelo de chat e lança erro informativo", async () => {
    const geradorMock: GeradorChat = {
      modelo: "gpt-4o-mini",
      gerar: vi.fn(),
    };
    const repoMock: Partial<RepositorioAnalise> = {
      obterMateriaPrima: vi.fn().mockResolvedValue({
        licitacao: { id: "lic-sem-texto", objeto: "Objeto sem anexos" },
        documentos: [],
        chunksDisponiveis: 0,
      } as MateriaPrimaAnalise),
      obterAnalise: vi.fn().mockResolvedValue(null),
      adquirirLease: vi.fn().mockResolvedValue({
        adquirido: true,
        linha: null,
        leaseId: "lease-123",
      }),
      falhar: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      executarAnaliseLicitacao({
        licitacaoId: "lic-sem-texto",
        repositorio: repoMock as RepositorioAnalise,
        gerador: geradorMock,
      }),
    ).rejects.toThrow(/texto disponível/i);

    expect(geradorMock.gerar).not.toHaveBeenCalled();
    expect(repoMock.falhar).toHaveBeenCalledWith("lic-sem-texto", "lease-123", expect.any(String));
  });

  it("lease ocupado não fura e retorna linha em processamento", async () => {
    const geradorMock: GeradorChat = {
      modelo: "gpt-4o-mini",
      gerar: vi.fn(),
    };
    const linhaProcessando = {
      licitacaoId: "lic-ocupada",
      estado: "processando",
      leaseId: "outro-lease",
    } as LinhaAnalise;

    const repoMock: Partial<RepositorioAnalise> = {
      obterMateriaPrima: vi.fn().mockResolvedValue({
        licitacao: { id: "lic-ocupada", objeto: "Compra" },
        documentos: [
          {
            documentoId: "doc-1",
            ativo: true,
            estado: "extraido",
            texto: "Texto",
            nome: "edital.pdf",
            tipoDocumento: "edital",
            sha256: "hash-1",
          },
        ],
        chunksDisponiveis: 0,
      } as MateriaPrimaAnalise),
      obterAnalise: vi.fn().mockResolvedValue(null),
      adquirirLease: vi.fn().mockResolvedValue({
        adquirido: false,
        linha: linhaProcessando,
        leaseId: "meu-lease",
      }),
    };

    const resultado = await executarAnaliseLicitacao({
      licitacaoId: "lic-ocupada",
      repositorio: repoMock as RepositorioAnalise,
      gerador: geradorMock,
    });

    expect(resultado.estado).toBe("processando");
    expect(geradorMock.gerar).not.toHaveBeenCalled();
  });

  it("forcar ignora cache e gera nova analise", async () => {
    const docId = "doc-1";
    const blocoEsperadoId = `${docId}:bloco:0`;
    const respostaValida = criarMockResultadoValido(blocoEsperadoId);

    const geradorMock: GeradorChat = {
      modelo: "gpt-4o-mini",
      gerar: vi.fn().mockResolvedValue(respostaValida),
    };
    const repoMock: Partial<RepositorioAnalise> = {
      obterMateriaPrima: vi.fn().mockResolvedValue({
        licitacao: { id: "lic-forcar", objeto: "Forçar regeração" },
        documentos: [
          {
            documentoId: docId,
            ativo: true,
            estado: "extraido",
            texto: "Texto completo do edital",
            nome: "edital.pdf",
            tipoDocumento: "edital",
            sha256: "hash-1",
          },
        ],
        chunksDisponiveis: 0,
      } as MateriaPrimaAnalise),
      obterAnalise: vi.fn().mockResolvedValue(null),
      adquirirLease: vi.fn().mockResolvedValue({
        adquirido: true,
        linha: null,
        leaseId: "lease-forcar",
      }),
      concluir: vi.fn().mockResolvedValue(undefined),
    };

    const resultado = await executarAnaliseLicitacao({
      licitacaoId: "lic-forcar",
      forcar: true,
      repositorio: repoMock as RepositorioAnalise,
      gerador: geradorMock,
    });

    expect(resultado.estado).toBe("pronta");
    expect(geradorMock.gerar).toHaveBeenCalledTimes(1);
    expect(repoMock.concluir).toHaveBeenCalledWith(
      expect.objectContaining({
        licitacaoId: "lic-forcar",
        leaseId: "lease-forcar",
      }),
    );
  });

  it("refaz análise salva em formato anterior quando a pessoa pede (forcar)", async () => {
    const repo = repoComAnaliseSalva("v1");
    const gerador: GeradorChat = {
      modelo: "gpt-4o-mini",
      gerar: vi.fn().mockResolvedValue(criarMockResultadoValido("doc-1:bloco:0")),
    };

    await executarAnaliseLicitacao({
      licitacaoId: "lic-salva",
      forcar: true,
      repositorio: repo as unknown as RepositorioAnalise,
      gerador,
    });

    expect(gerador.gerar).toHaveBeenCalledTimes(1);
    expect(repo.concluir).toHaveBeenCalledTimes(1);
  });

  it("não refaz análise salva no formato atual, mesmo com forcar", async () => {
    const repo = repoComAnaliseSalva(PROMPT_VERSAO);
    const gerador: GeradorChat = { modelo: "gpt-4o-mini", gerar: vi.fn() };

    const linha = await executarAnaliseLicitacao({
      licitacaoId: "lic-salva",
      forcar: true,
      repositorio: repo as unknown as RepositorioAnalise,
      gerador,
    });

    expect(linha.estado).toBe("pronta");
    expect(gerador.gerar).not.toHaveBeenCalled();
    expect(repo.adquirirLease).not.toHaveBeenCalled();
  });

  it("descarta fonteId inventado pelo modelo e conclui a análise", async () => {
    const repo = repoComAnaliseSalva("v1");
    repo.obterAnalise.mockResolvedValue(null);
    const gerador: GeradorChat = {
      modelo: "gpt-4o-mini",
      gerar: vi.fn().mockResolvedValue(criarMockResultadoValido("fonte-fantasma-999")),
    };

    await executarAnaliseLicitacao({
      licitacaoId: "lic-salva",
      repositorio: repo as unknown as RepositorioAnalise,
      gerador,
    });

    const salvo = repo.concluir.mock.calls[0]?.[0] as { resultado: string };
    expect(JSON.stringify(salvo.resultado)).not.toContain("fonte-fantasma-999");
    expect(JSON.stringify(salvo.resultado)).toContain("60 dias corridos");
  });

  it("resposta que não é JSON válido ganha uma segunda tentativa antes de virar erro", async () => {
    // 24/09/2026: 1 falha em 5 execuções do mesmo prompt, sem corte de saída;
    // a repetição passou. Uma segunda chamada custa menos que a pessoa refazer.
    const repo = repoComAnaliseSalva("v2");
    repo.obterAnalise.mockResolvedValue(null);
    const gerador: GeradorChat = {
      modelo: "gpt-4o-mini",
      gerar: vi
        .fn()
        .mockResolvedValueOnce('{"resumoExecutivo": "cortad')
        .mockResolvedValueOnce(criarMockResultadoValido("doc-1:bloco:0")),
    };

    await executarAnaliseLicitacao({
      licitacaoId: "lic-salva",
      repositorio: repo as unknown as RepositorioAnalise,
      gerador,
    });

    expect(gerador.gerar).toHaveBeenCalledTimes(2);
    expect(repo.concluir).toHaveBeenCalledTimes(1);
  });

  it("duas respostas inválidas viram erro com o começo da resposta, para diagnóstico", async () => {
    const repo = { ...repoComAnaliseSalva("v2"), falhar: vi.fn().mockResolvedValue(undefined) };
    repo.obterAnalise.mockResolvedValue(null);
    const gerador: GeradorChat = {
      modelo: "gpt-4o-mini",
      gerar: vi.fn().mockResolvedValue("Desculpe, não consigo"),
    };

    await expect(
      executarAnaliseLicitacao({
        licitacaoId: "lic-salva",
        repositorio: repo as unknown as RepositorioAnalise,
        gerador,
      }),
    ).rejects.toThrow(/JSON válido.*Desculpe, não consigo/);
    expect(gerador.gerar).toHaveBeenCalledTimes(2);
    expect(repo.concluir).not.toHaveBeenCalled();
  });

  describe("itens do PNCP", () => {
    function repoComCompra() {
      const repo = repoComAnaliseSalva("v2");
      repo.obterAnalise.mockResolvedValue(null);
      repo.obterMateriaPrima.mockResolvedValue({
        licitacao: {
          id: "lic-salva",
          objeto: "Credenciamento de consultas",
          cnpj_orgao: "12345678000190",
          ano_compra: 2026,
          sequencial_compra: 14,
          situacao_compra_id: 1,
          data_encerramento_proposta: "2026-12-01T12:00:00+00:00",
        },
        documentos: [
          {
            documentoId: "doc-1",
            ativo: true,
            estado: "extraido",
            texto: "Texto do termo de referência",
            nome: "TERMO_DE_REFERENCIA.pdf",
            tipoDocumento: "anexo",
            sha256: "hash-1",
          },
        ],
        chunksDisponiveis: 0,
      } as MateriaPrimaAnalise);
      return repo;
    }

    const homologado = (numeroItem: number) => ({
      numeroItem,
      descricao: `CONSULTA ESPECIALIDADE ${numeroItem}`,
      quantidade: 100,
      unidadeMedida: "SERVIÇO",
      valorUnitarioEstimado: 150,
      valorTotal: 15_000,
      tipoBeneficioNome: "Não se aplica",
      situacaoCompraItemNome: "Homologado",
      temResultado: true,
    });

    it("envia os itens ao modelo e salva os fatos do certame calculados pelo sistema", async () => {
      const repo = repoComCompra();
      const gerador: GeradorChat = {
        modelo: "gpt-4o-mini",
        gerar: vi.fn().mockResolvedValue(criarMockResultadoValido("doc-1:bloco:0")),
      };
      const obterItens = vi.fn().mockResolvedValue([homologado(1), homologado(2)]);

      await executarAnaliseLicitacao({
        licitacaoId: "lic-salva",
        repositorio: repo as unknown as RepositorioAnalise,
        gerador,
        obterItens,
        agora: () => new Date("2026-09-24T12:00:00-03:00"),
      });

      expect(obterItens).toHaveBeenCalledWith({
        cnpj: "12345678000190",
        ano: 2026,
        sequencial: 14,
      });
      expect(vi.mocked(gerador.gerar).mock.calls[0]?.[0]).toContain("CONSULTA ESPECIALIDADE 2");
      const salvo = repo.concluir.mock.calls[0]?.[0] as {
        resultado: { fatosPncp: Record<string, unknown>; alertasSistema: string[] };
      };
      expect(salvo.resultado.fatosPncp).toMatchObject({
        itensDisponiveis: true,
        totalItens: 2,
        valorTotalItens: 30_000,
        situacaoCertame: "homologado",
      });
      expect(salvo.resultado.alertasSistema).toEqual([]);
    });

    it("falha do PNCP ao ler os itens não derruba a análise: segue sem itens e registra alerta", async () => {
      const repo = repoComCompra();
      const gerador: GeradorChat = {
        modelo: "gpt-4o-mini",
        gerar: vi.fn().mockResolvedValue(criarMockResultadoValido("doc-1:bloco:0")),
      };

      await executarAnaliseLicitacao({
        licitacaoId: "lic-salva",
        repositorio: repo as unknown as RepositorioAnalise,
        gerador,
        obterItens: vi.fn().mockRejectedValue(new Error("HTTP 504")),
        agora: () => new Date("2026-09-24T12:00:00-03:00"),
      });

      expect(vi.mocked(gerador.gerar).mock.calls[0]?.[0]).toMatch(/itens do PNCP indispon/i);
      const salvo = repo.concluir.mock.calls[0]?.[0] as {
        resultado: { fatosPncp: Record<string, unknown>; alertasSistema: string[] };
      };
      expect(salvo.resultado.fatosPncp).toMatchObject({
        itensDisponiveis: false,
        situacaoCertame: "aberto",
      });
      expect(salvo.resultado.alertasSistema).toEqual([expect.stringMatching(/itens do PNCP/i)]);
    });
  });
});
