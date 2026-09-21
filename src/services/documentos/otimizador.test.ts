import { describe, expect, it, vi } from "vitest";
import {
  calcularRelevanciaDocumento,
  filtrarDocumentosEssenciais,
  sincronizarArquivosLicitacaoSobDemanda,
  type DocumentoParaFiltro,
} from "./otimizador.server";

describe("otimizador de documentos PNCP", () => {
  it("prioriza editais, termos de referencia e projetos", () => {
    const edital: DocumentoParaFiltro = {
      id: "1",
      nome: "EDITAL DE PREGAO ELETRONICO 01.pdf",
      tipo_documento: "edital",
      url: "https://pncp/1",
      ativo: true,
    };
    const tr: DocumentoParaFiltro = {
      id: "2",
      nome: "Termo de Referência Anexo I.pdf",
      tipo_documento: "anexo",
      url: "https://pncp/2",
      ativo: true,
    };

    expect(calcularRelevanciaDocumento(edital)).toBeGreaterThanOrEqual(90);
    expect(calcularRelevanciaDocumento(tr)).toBeGreaterThanOrEqual(90);
  });

  it("penaliza recibos, certidões e comprovantes de diário oficial", () => {
    const recibo: DocumentoParaFiltro = {
      id: "3",
      nome: "Recibo de publicação no jornal oficial.pdf",
      tipo_documento: "outro",
      url: "https://pncp/3",
      ativo: true,
    };
    const certidao: DocumentoParaFiltro = {
      id: "4",
      nome: "Certidão de regularidade fiscal.pdf",
      tipo_documento: "outro",
      url: "https://pncp/4",
      ativo: true,
    };

    expect(calcularRelevanciaDocumento(recibo)).toBe(1);
    expect(calcularRelevanciaDocumento(certidao)).toBe(1);
  });

  it("descarta documentos inativos ou sem url", () => {
    const inativo: DocumentoParaFiltro = {
      id: "5",
      nome: "Edital antigo.pdf",
      tipo_documento: "edital",
      url: "https://pncp/5",
      ativo: false,
    };
    const semUrl: DocumentoParaFiltro = {
      id: "6",
      nome: "Edital sem link.pdf",
      tipo_documento: "edital",
      url: null,
      ativo: true,
    };

    expect(calcularRelevanciaDocumento(inativo)).toBeLessThan(0);
    expect(calcularRelevanciaDocumento(semUrl)).toBeLessThan(0);
  });

  it("filtra e ordena os documentos essenciais limitando o total", () => {
    const lista: DocumentoParaFiltro[] = [
      { id: "r1", nome: "Recibo de publicação", url: "https://pncp/r1", ativo: true },
      { id: "e1", nome: "Edital do Pregão.pdf", url: "https://pncp/e1", ativo: true },
      { id: "tr1", nome: "Termo de Referência.pdf", url: "https://pncp/tr1", ativo: true },
      { id: "p1", nome: "Planilha Orçamentária.xlsx", url: "https://pncp/p1", ativo: true },
      { id: "c1", nome: "Certidão Negativa.pdf", url: "https://pncp/c1", ativo: true },
    ];

    const filtrados = filtrarDocumentosEssenciais(lista, 3);
    expect(filtrados.length).toBe(3);
    expect(filtrados[0]?.id).toBe("e1");
    expect(filtrados.some((d) => d.id === "r1")).toBe(false);
  });

  it("sincroniza sob demanda quando já existem arquivos prontos", async () => {
    const clienteMock = {
      from: vi.fn((tabela: string) => {
        if (tabela === "licitacoes") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { id: "lic-1", cnpj_orgao: "123", ano_compra: 2026, sequencial_compra: 1 },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (tabela === "documentos_licitacao") {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({
                  data: [
                    { id: "doc-1", nome: "Edital.pdf", tipo_documento: "edital", url: "https://pncp/1", ativo: true },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (tabela === "documentos_arquivo") {
          return {
            select: () => ({
              in: async () => ({
                data: [
                  { documento_id: "doc-1", estado: "extraido", chars: 1500, paginas: 3 },
                ],
                error: null,
              }),
            }),
          };
        }
        return {};
      }),
    };

    const resultado = await sincronizarArquivosLicitacaoSobDemanda("lic-1", {
      cliente: clienteMock as any,
    });

    expect(resultado.licitacaoId).toBe("lic-1");
    expect(resultado.documentosProntos.length).toBe(1);
    expect(resultado.documentosProntos[0]?.documentoId).toBe("doc-1");
    expect(resultado.extraidos).toBe(1);
  });
});
