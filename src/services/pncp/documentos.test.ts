/**
 * Conversão de metadados de documentos. Os casos difíceis vêm da sondagem real
 * de 14/09/2026 contra `/arquivos` — aspas literais no título, mojibake da
 * própria fonte e "Outros Documentos" cobrindo projeto, planilha e BDI.
 */
import { describe, expect, it } from "vitest";
import {
  ArquivoInvalidoError,
  classificarDocumento,
  classificarPorTipoPncp,
  classificarPorTitulo,
  limparTitulo,
  mapearArquivos,
  repararMojibake,
  urlArquivos,
  type ArquivoPNCP,
} from "./documentos";

const LICITACAO = "11111111-2222-3333-4444-555555555555";

/** Item como a fonte devolve, com os campos que importam. */
const arquivo = (over: Partial<ArquivoPNCP> = {}): ArquivoPNCP => ({
  uri: "https://pncp.gov.br/pncp-api/v1/orgaos/45132495000140/compras/2026/206/arquivos/1",
  url: "https://pncp.gov.br/pncp-api/v1/orgaos/45132495000140/compras/2026/206/arquivos/1",
  statusAtivo: true,
  dataPublicacaoPncp: "2026-04-10T13:58:25",
  sequencialDocumento: 1,
  titulo: "edital.pdf",
  tipoDocumentoNome: "Edital",
  tipoDocumentoId: 2,
  ...over,
});

describe("urlArquivos", () => {
  it("monta a rota da base de Integração", () => {
    expect(urlArquivos("45132495000140", 2026, 206)).toBe(
      "https://pncp.gov.br/api/pncp/v1/orgaos/45132495000140/compras/2026/206/arquivos",
    );
  });

  it("aceita CNPJ com letras, como o manual v2.5 prevê", () => {
    expect(urlArquivos("4513249500014A", 2026, 1)).toContain("/orgaos/4513249500014A/");
  });

  it("recusa identificadores impossíveis antes de gastar rede", () => {
    expect(() => urlArquivos("123", 2026, 1)).toThrow(ArquivoInvalidoError);
    expect(() => urlArquivos("45132495000140", 2026, 0)).toThrow(/maior que zero/);
    expect(() => urlArquivos("45132495000140", 1800, 1)).toThrow(/intervalo plausível/);
  });
});

describe("limpeza de título", () => {
  it("desfaz o mojibake que vem da própria fonte", () => {
    expect(repararMojibake("edital52-26planilhaorÃ§amentaria.pdf")).toBe(
      "edital52-26planilhaorçamentaria.pdf",
    );
    expect(repararMojibake("ConstruÃ§Ã£o de creche")).toBe("Construção de creche");
  });

  it("preserva texto que já está correto", () => {
    expect(repararMojibake("Construção de praça")).toBe("Construção de praça");
    expect(repararMojibake("PROJ_PARQUE.pdf")).toBe("PROJ_PARQUE.pdf");
  });

  it("remove as aspas literais que envolvem parte dos nomes", () => {
    expect(limparTitulo('"edital.52-26-cpe.05-26.caminhao.pipa-obras.pdf"')).toBe(
      "edital.52-26-cpe.05-26.caminhao.pipa-obras.pdf",
    );
  });

  it("normaliza espaços e trata ausência de título", () => {
    expect(limparTitulo("  CE 011-26 -   Proc.  00473.pdf ")).toBe("CE 011-26 - Proc. 00473.pdf");
    expect(limparTitulo(null)).toBe("");
    expect(limparTitulo("")).toBe("");
  });
});

describe("classificação", () => {
  it("confia no rótulo da fonte quando ela se compromete", () => {
    expect(classificarPorTipoPncp("Edital")).toBe("edital");
    expect(classificarPorTipoPncp("Projeto Básico")).toBe("projeto");
    expect(classificarPorTipoPncp("Termo de Referência")).toBe("anexo");
    expect(classificarPorTipoPncp("Minuta do Contrato")).toBe("anexo");
  });

  it('não classifica com base em "Outros Documentos" nem em rótulo desconhecido', () => {
    expect(classificarPorTipoPncp("Outros Documentos")).toBeNull();
    expect(classificarPorTipoPncp("Documento Estranho")).toBeNull();
    expect(classificarPorTipoPncp(null)).toBeNull();
  });

  it("classifica pelo título o que a fonte deixou como Outros Documentos", () => {
    expect(classificarPorTitulo("PROJ_PARQUE_PERALTAS.pdf")).toBe("projeto");
    expect(classificarPorTitulo("COMPOSICAO_DE_BDI.pdf")).toBe("orcamento");
    expect(classificarPorTitulo("Memorial Descritivo - Creche.pdf")).toBe("projeto");
    expect(classificarPorTitulo("cronograma fisico-financeiro.xlsx")).toBe("orcamento");
    expect(classificarPorTitulo("edital52-26termodereferencia.pdf")).toBe("anexo");
  });

  it("o termo mais específico vence quando o nome carrega os dois", () => {
    // O arquivo é a planilha DO edital: descrevê-lo como edital perderia a
    // informação que o score de documentos usa.
    expect(classificarPorTitulo("edital52-26planilhaorçamentaria.pdf")).toBe("orcamento");
    expect(classificarPorTitulo("edital-anexo-projeto-basico.pdf")).toBe("projeto");
  });

  it('"planta" não é inferida de "implantação"', () => {
    expect(classificarPorTitulo("IMPLANTACAO_DE_REDE_DE_AGUA.pdf")).toBeNull();
    expect(classificarPorTitulo("planta baixa - pavimento terreo.dwg")).toBe("projeto");
  });

  it("sem evidência, o tipo é 'outro' — nada é chutado", () => {
    expect(classificarPorTitulo("92612003900042026001")).toBeNull();
    expect(
      classificarDocumento(
        arquivo({ tipoDocumentoNome: "Outros Documentos", titulo: "92612003900042026001" }),
      ),
    ).toBe("outro");
  });

  it("o rótulo da fonte tem precedência sobre o título", () => {
    expect(
      classificarDocumento(arquivo({ tipoDocumentoNome: "Edital", titulo: "anexo-i.pdf" })),
    ).toBe("edital");
  });
});

describe("mapearArquivos", () => {
  it("converte o array real em linhas do catálogo", () => {
    const { linhas, rejeitados } = mapearArquivos(LICITACAO, [
      arquivo({
        sequencialDocumento: 1,
        titulo: '"edital.52-26-cpe.05-26.caminhao.pipa-obras.pdf"',
        tipoDocumentoNome: "Edital",
      }),
      arquivo({
        sequencialDocumento: 3,
        titulo: '"edital52-26planilhaorÃ§amentaria.pdf"',
        tipoDocumentoNome: "Outros Documentos",
        dataPublicacaoPncp: "2026-04-14T09:07:56",
      }),
    ]);

    expect(rejeitados).toEqual([]);
    expect(linhas).toHaveLength(2);

    expect(linhas[0]).toMatchObject({
      licitacao_id: LICITACAO,
      sequencial_documento: 1,
      tipo_documento: "edital",
      tipo_documento_pncp: "Edital",
      nome: "edital.52-26-cpe.05-26.caminhao.pipa-obras.pdf",
      ativo: true,
    });

    expect(linhas[1]).toMatchObject({
      sequencial_documento: 3,
      tipo_documento: "orcamento",
      nome: "edital52-26planilhaorçamentaria.pdf",
    });
  });

  it("lê a data sem offset como horário de Brasília, não como UTC", () => {
    const { linhas } = mapearArquivos(LICITACAO, [
      arquivo({ dataPublicacaoPncp: "2026-04-10T13:58:25" }),
    ]);
    // 13:58 em Brasília (UTC-3) é 16:58 UTC.
    expect(linhas[0]!.data_publicacao).toBe("2026-04-10T16:58:25.000Z");
  });

  it("marca como inativo o documento que a fonte retirou", () => {
    const { linhas } = mapearArquivos(LICITACAO, [arquivo({ statusAtivo: false })]);
    expect(linhas[0]!.ativo).toBe(false);
  });

  it("documento sem sequencial vira evidência, não derruba o lote", () => {
    const { linhas, rejeitados } = mapearArquivos(LICITACAO, [
      arquivo({ sequencialDocumento: null, titulo: "sem-identidade.pdf" }),
      arquivo({ sequencialDocumento: 2, titulo: "edital.pdf" }),
    ]);

    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.sequencial_documento).toBe(2);
    expect(rejeitados[0]).toContain("sem-identidade.pdf");
  });

  it("sequencial repetido mantém a última ocorrência e sai ordenado", () => {
    const { linhas } = mapearArquivos(LICITACAO, [
      arquivo({ sequencialDocumento: 5, titulo: "antigo.pdf" }),
      arquivo({ sequencialDocumento: 2, titulo: "outro.pdf" }),
      arquivo({ sequencialDocumento: 5, titulo: "novo.pdf" }),
    ]);

    expect(linhas.map((l) => l.sequencial_documento)).toEqual([2, 5]);
    expect(linhas[1]!.nome).toBe("novo.pdf");
  });

  it("cai para uri quando url não vem", () => {
    const { linhas } = mapearArquivos(LICITACAO, [arquivo({ url: null })]);
    expect(linhas[0]!.url).toContain("/arquivos/1");
  });

  it("array vazio é resposta legítima: licitação sem documento publicado", () => {
    expect(mapearArquivos(LICITACAO, [])).toEqual({ linhas: [], rejeitados: [] });
  });
});

describe("rótulos que a fonte realmente usa", () => {
  // Distribuição medida em 195 documentos de 40 licitações (14/09/2026).
  it.each([
    ["Edital", "edital"],
    ["Termo de Referência", "anexo"],
    ["Aviso de Contratação Direta", "edital"],
    ["Estudo Técnico Preliminar", "anexo"],
    ["Mapa de Riscos", "anexo"],
    ["Minuta do Contrato", "anexo"],
    ["Projeto Básico", "projeto"],
  ])("%s → %s", (rotulo, esperado) => {
    expect(classificarPorTipoPncp(rotulo)).toBe(esperado);
  });

  it('"Ato que autoriza a Contratação Direta" não vira edital nem contrato', () => {
    // "contratacao" não contém "contrato": o ato administrativo não é o
    // instrumento convocatório nem a minuta, e fica sem tipo até o título dizer.
    expect(classificarPorTipoPncp("Ato que autoriza a Contratação Direta")).toBeNull();
  });
});
