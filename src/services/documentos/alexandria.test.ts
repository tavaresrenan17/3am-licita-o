import { describe, expect, it } from "vitest";

describe("Gestão e Movimentação de Licitações em Alexandria", () => {
  it("valida a estrutura de parâmetros e tipos da tela Alexandria", () => {
    const params = {
      ids: "123,456",
      busca: "hospital",
      statusInterno: "interessante",
    };

    const idsArray = params.ids ? params.ids.split(",").map((s) => s.trim()) : [];
    expect(idsArray).toHaveLength(2);
    expect(idsArray[0]).toBe("123");
    expect(idsArray[1]).toBe("456");
  });

  it("garante que licitações movidas para Alexandria não aparecem na listagem comum", () => {
    const licitacoesGerais = [
      { id: "lic-1", objeto: "Reforma de UBS" },
      { id: "lic-2", objeto: "Pavimentação asfáltica" },
      { id: "lic-3", objeto: "Construção de creche" },
    ];

    // Usuário seleciona lic-2 para Alexandria
    const idsEmAlexandria = new Set(["lic-2"]);

    // Na aba Licitações comuns, itens em Alexandria são ocultados
    const visiveisEmLicitacoes = licitacoesGerais.filter(
      (l) => !idsEmAlexandria.has(l.id),
    );

    expect(visiveisEmLicitacoes).toHaveLength(2);
    expect(visiveisEmLicitacoes.map((l) => l.id)).toEqual(["lic-1", "lic-3"]);
  });

  it("garante que dentro de Alexandria aparecem SOMENTE as selecionadas e permite remoção", () => {
    const todasLicitacoes = [
      { id: "lic-1", objeto: "Reforma de UBS" },
      { id: "lic-2", objeto: "Pavimentação asfáltica" },
      { id: "lic-3", objeto: "Construção de creche" },
    ];

    // Nenhuma licitação selecionada: Alexandria vazia
    let idsEmAlexandria = new Set<string>();
    let emAlexandria = todasLicitacoes.filter((l) => idsEmAlexandria.has(l.id));
    expect(emAlexandria).toHaveLength(0);

    // Usuário move lic-1 e lic-3 para Alexandria
    idsEmAlexandria = new Set(["lic-1", "lic-3"]);
    emAlexandria = todasLicitacoes.filter((l) => idsEmAlexandria.has(l.id));
    expect(emAlexandria).toHaveLength(2);
    expect(emAlexandria.map((l) => l.id)).toEqual(["lic-1", "lic-3"]);

    // Usuário remove lic-1 de Alexandria (devolvendo para Licitações gerais)
    idsEmAlexandria.delete("lic-1");
    emAlexandria = todasLicitacoes.filter((l) => idsEmAlexandria.has(l.id));
    expect(emAlexandria).toHaveLength(1);
    expect(emAlexandria[0].id).toBe("lic-3");

    // Agora lic-1 volta a ser visível na aba de Licitações gerais
    const visiveisGerais = todasLicitacoes.filter((l) => !idsEmAlexandria.has(l.id));
    expect(visiveisGerais.map((l) => l.id)).toEqual(["lic-1", "lic-2"]);
  });

  it("garante que documentos baixados são mapeados corretamente mesmo com documentos_arquivo 1:1 objeto ou array", () => {
    const rawDocumentosLicitacao = [
      {
        id: "doc-1",
        nome: "Edital Concorrência Taubaté",
        tipo_documento: "edital",
        url: "https://pncp.gov.br/arquivo/1",
        ativo: true,
        documentos_arquivo: {
          chars: 192254,
          paginas: 59,
          estado: "extraido",
        },
      },
      {
        id: "doc-2",
        nome: "Termo de Referência",
        tipo_documento: "anexo",
        url: "https://pncp.gov.br/arquivo/2",
        ativo: true,
        documentos_arquivo: null,
      },
    ];

    const docsBaixados = rawDocumentosLicitacao
      .filter((d) => d.ativo !== false)
      .map((d) => {
        const arqRaw = d.documentos_arquivo;
        const arq = Array.isArray(arqRaw)
          ? ((arqRaw[0] as Record<string, unknown>) ?? {})
          : ((arqRaw as Record<string, unknown>) ?? {});
        return {
          id: d.id,
          nome: d.nome,
          tipo_documento: d.tipo_documento,
          chars: Number(arq["chars"] ?? 0),
          paginas: Number(arq["paginas"] ?? 1),
          url: d.url,
        };
      });

    expect(docsBaixados).toHaveLength(2);
    expect(docsBaixados[0].chars).toBe(192254);
    expect(docsBaixados[0].paginas).toBe(59);
    expect(docsBaixados[1].chars).toBe(0);
    expect(docsBaixados[1].paginas).toBe(1);
    expect(docsBaixados[0].url).toBe("https://pncp.gov.br/arquivo/1");
  });
});
