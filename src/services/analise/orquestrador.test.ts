import { describe, expect, it, vi } from "vitest";
import { executarAnaliseLicitacao } from "./orquestrador.server";
import type { GeradorChat } from "./gerador.server";
import type {
  RepositorioAnalise,
  LinhaAnalise,
  MateriaPrimaAnalise,
} from "./repositorio.analise.server";
import type { Embedder } from "../busca/embedder";

function criarMockResultadoValido(fonteId: string) {
  return JSON.stringify({
    veredito: "favoravel",
    confianca: "alta",
    resumoExecutivo: "Licitação para compra de equipamentos escolares.",
    pontosImportantes: [
      {
        titulo: "Entrega em 30 dias",
        descricao: "Prazo fixado na cláusula 4",
        fonteIds: [fonteId],
      },
    ],
    prazos: [
      {
        titulo: "Abertura das propostas",
        descricao: "Dia 10/10 às 09h",
        fonteIds: [fonteId],
      },
    ],
    requisitos: [
      {
        titulo: "Qualificação técnica",
        descricao: "Atestado de capacidade",
        fonteIds: [fonteId],
      },
    ],
    riscos: [
      {
        titulo: "Multa por atraso",
        descricao: "1% ao dia",
        severidade: "media",
        fonteIds: [fonteId],
      },
    ],
    proximosPassos: ["Elaborar proposta comercial", "Revisar certidões"],
  });
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

  it("rejeita quando o modelo inventa fonteId inexistente", async () => {
    const docId = "doc-1";
    const respostaComFonteInventada = criarMockResultadoValido("fonte-fantasma-999");

    const geradorMock: GeradorChat = {
      modelo: "gpt-4o-mini",
      gerar: vi.fn().mockResolvedValue(respostaComFonteInventada),
    };
    const repoMock: Partial<RepositorioAnalise> = {
      obterMateriaPrima: vi.fn().mockResolvedValue({
        licitacao: { id: "lic-fonte-falsa", objeto: "Teste fonte" },
        documentos: [
          {
            documentoId: docId,
            ativo: true,
            estado: "extraido",
            texto: "Texto real do edital",
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
        leaseId: "lease-fonte-falsa",
      }),
      falhar: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      executarAnaliseLicitacao({
        licitacaoId: "lic-fonte-falsa",
        repositorio: repoMock as RepositorioAnalise,
        gerador: geradorMock,
      }),
    ).rejects.toThrow(/fonte.*desconhecida|fonte/i);

    expect(repoMock.falhar).toHaveBeenCalledWith(
      "lic-fonte-falsa",
      "lease-fonte-falsa",
      expect.any(String),
    );
  });
});
