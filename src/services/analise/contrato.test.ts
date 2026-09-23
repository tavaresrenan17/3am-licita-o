import { describe, expect, it } from "vitest";
import {
  PARTE1_PRAZOS_CONTATOS,
  PARTE2_HABILITACAO,
  PARTE3_REQUISITOS,
  confirmarTrechos,
  ehFormatoAtual,
  parsearAnaliseResultado,
  validarFontes,
} from "./contrato";
import { respostaV2 } from "./__fixtures__/respostaV2";

describe("Contrato da análise v2 (veredito + três partes)", () => {
  it("faz parse do parecer e das três partes e marca o formato", () => {
    const r = parsearAnaliseResultado(JSON.stringify(respostaV2("fonte-1")));

    expect(r.formato).toBe("v2");
    expect(ehFormatoAtual(r)).toBe(true);
    expect(r.veredito).toBe("atencao");
    expect(r.parecerEngenheiro?.decisao).toBe("go_com_ressalvas");
    expect(r.prazosContatos["procedimentais"]?.["validadeProposta"]).toMatchObject({
      valor: "60 dias corridos",
      fonteIds: ["fonte-1"],
    });
    expect(r.habilitacao["fiscalTributario"]).toHaveLength(2);
    expect(r.requisitosOperacionais["julgamento"]?.["forma"]?.valor).toBe("Por lote");
    expect(r.enderecosEntrega[0]).toMatchObject({ cidade: "São Paulo", uf: "SP" });
  });

  it("todo campo do catálogo existe no resultado, null quando o edital não informa", () => {
    const r = parsearAnaliseResultado(JSON.stringify(respostaV2("fonte-1")));
    for (const secao of PARTE1_PRAZOS_CONTATOS) {
      for (const campo of secao.campos) {
        expect(r.prazosContatos[secao.chave]).toHaveProperty(campo.chave);
      }
    }
    for (const secao of PARTE3_REQUISITOS) {
      for (const campo of secao.campos) {
        expect(r.requisitosOperacionais[secao.chave]).toHaveProperty(campo.chave);
      }
    }
    for (const secao of PARTE2_HABILITACAO) {
      expect(Array.isArray(r.habilitacao[secao.chave])).toBe(true);
    }
    expect(r.prazosContatos["comissao"]?.["endereco"]).toBeNull();
  });

  it("aceita seções inteiras ausentes sem derrubar a análise", () => {
    const r = parsearAnaliseResultado(
      JSON.stringify({
        veredito: "insuficiente",
        confianca: "baixa",
        resumoExecutivo: "Sem edital legível.",
      }),
    );
    expect(r.prazosContatos["pregoeiro"]?.["nome"]).toBeNull();
    expect(r.habilitacao["tecnicoOperacional"]).toEqual([]);
    expect(r.enderecosEntrega).toEqual([]);
  });

  it('trata "não informado" como ausência, mas preserva respostas do edital como "Não exigida"', () => {
    const bruto = respostaV2("fonte-1");
    bruto.prazosContatos.procedimentais.vistoriaTecnica = {
      valor: "Não informado no edital",
      fonteIds: [],
    } as never;
    const r = parsearAnaliseResultado(JSON.stringify(bruto));
    expect(r.prazosContatos["procedimentais"]?.["vistoriaTecnica"]).toBeNull();
    expect(r.requisitosOperacionais["garantias"]?.["garantiaExecucao"]?.valor).toBe("Não exigida");
    expect(r.requisitosOperacionais["amostras"]?.["catalogoFolder"]?.valor).toBe("Não exigido");
  });

  it("aceita campo respondido como texto puro, sem fonte", () => {
    const bruto = respostaV2("fonte-1") as Record<string, unknown>;
    (bruto["prazosContatos"] as { pregoeiro: Record<string, unknown> }).pregoeiro["horario"] =
      "8h às 17h";
    const r = parsearAnaliseResultado(JSON.stringify(bruto));
    expect(r.prazosContatos["pregoeiro"]?.["horario"]).toMatchObject({
      valor: "8h às 17h",
      fonteIds: [],
    });
  });

  it("exigência desconhecida vira obrigatória em vez de derrubar a análise", () => {
    const bruto = respostaV2("fonte-1");
    (bruto.habilitacao.fiscalTributario[0] as { exigencia: string }).exigencia = "essencial";
    const r = parsearAnaliseResultado(JSON.stringify(bruto));
    expect(r.habilitacao["fiscalTributario"]?.[0]?.exigencia).toBe("obrigatorio");
  });

  it("rejeita veredito fora do contrato e JSON inválido", () => {
    expect(() =>
      parsearAnaliseResultado(JSON.stringify({ ...respostaV2("f"), veredito: "otimo" })),
    ).toThrow(/contrato/);
    expect(() => parsearAnaliseResultado("```json\n{}\n```")).toThrow(/JSON/);
  });

  it("descarta fonteIds inventados sem perder o valor extraído", () => {
    const r = parsearAnaliseResultado(JSON.stringify(respostaV2("fonte-fantasma")));
    validarFontes(r, [{ id: "fonte-1" }]);
    expect(r.prazosContatos["procedimentais"]?.["validadeProposta"]).toMatchObject({
      valor: "60 dias corridos",
      fonteIds: [],
    });
    expect(r.habilitacao["fiscalTributario"]?.[0]?.fonteIds).toEqual([]);
    expect(r.enderecosEntrega[0]?.fonteIds).toEqual([]);
  });

  it("mantém fonteIds conhecidos", () => {
    const r = validarFontes(parsearAnaliseResultado(JSON.stringify(respostaV2("fonte-1"))), [
      { id: "fonte-1" },
    ]);
    expect(r.requisitosOperacionais["lances"]?.["intervaloMinimo"]?.fonteIds).toEqual(["fonte-1"]);
  });

  it("formato v1 salvo não é reconhecido como atual", () => {
    expect(
      ehFormatoAtual({
        veredito: "favoravel",
        confianca: "alta",
        resumoExecutivo: "x",
        pontosImportantes: [],
        prazos: [],
        requisitos: [],
        riscos: [],
        proximosPassos: [],
      }),
    ).toBe(false);
  });

  describe("confirmação das frases citadas", () => {
    const edital =
      "5.1. A proposta terá validade de 60 (sessenta) dias corridos, contados da data de abertura. " +
      "4.2. Não haverá exigência da garantia da contratação dos arts. 96 e seguintes da Lei. " +
      "Os bens devem atender às normas da Associação Brasileira de Normas Técnicas – ABNT, periódi- cas.";

    const analisar = (mudar: (b: ReturnType<typeof respostaV2>) => void) => {
      const bruto = respostaV2("bloco-1");
      mudar(bruto);
      return confirmarTrechos(
        parsearAnaliseResultado(JSON.stringify(bruto)),
        new Map([["bloco-1", edital]]),
      );
    };

    it("confirma a frase que existe no edital, ignorando caixa, acento e pontuação", () => {
      const r = analisar(() => {});
      expect(r.prazosContatos["procedimentais"]?.["validadeProposta"]?.confirmado).toBe(true);
    });

    it('negativa sem frase citada volta a ser "não informado" (silêncio não é "não exigido")', () => {
      const r = analisar(() => {});
      expect(r.requisitosOperacionais["amostras"]?.["catalogoFolder"]).toBeNull();
    });

    it("valor afirmativo sem frase confirmada fica, marcado como não confirmado", () => {
      const r = analisar(() => {});
      expect(r.prazosContatos["comerciais"]?.["pagamento"]).toMatchObject({
        valor: "30 dias após o recebimento definitivo",
        confirmado: false,
      });
    });

    it("confirma frase achada em outro bloco e corrige a fonte para onde ela está", () => {
      const bruto = respostaV2("bloco-errado");
      const r = confirmarTrechos(
        parsearAnaliseResultado(JSON.stringify(bruto)),
        new Map([
          ["bloco-errado", "Texto sem relação com a validade."],
          ["bloco-1", edital],
        ]),
      );
      expect(r.prazosContatos["procedimentais"]?.["validadeProposta"]).toMatchObject({
        confirmado: true,
        fonteIds: ["bloco-1"],
      });
    });

    it("frase que admite o silêncio do edital zera o campo", () => {
      const r = analisar((b) => {
        (b.requisitosOperacionais.julgamento as Record<string, unknown>)["preferenciaMeEpp"] = {
          valor: "Não aplicável",
          trecho: "Não se menciona preferência para ME/EPP.",
          fonteIds: ["bloco-1"],
        };
      });
      expect(r.requisitosOperacionais["julgamento"]?.["preferenciaMeEpp"]).toBeNull();
    });

    it('negativa com frase inventada também volta a ser "não informado"', () => {
      const r = analisar((b) => {
        (b.requisitosOperacionais.entrega as Record<string, unknown>)["treinamento"] = {
          valor: "Não exigido",
          trecho: "Não será exigido treinamento da equipe",
          fonteIds: ["bloco-1"],
        };
      });
      expect(r.requisitosOperacionais["entrega"]?.["treinamento"]).toBeNull();
    });

    it("confirma negativa expressa e tolera reticências e hifenização do PDF", () => {
      const r = analisar((b) => {
        (b.requisitosOperacionais.garantias as Record<string, unknown>)["garantiaExecucao"] = {
          valor: "Não exigida",
          trecho: "Não haverá exigência da garantia da contratação (...) arts. 96 e seguintes",
          fonteIds: ["bloco-1"],
        };
        b.habilitacao.tecnicoOperacional = [
          {
            documento: "Atendimento às normas ABNT",
            exigencia: "obrigatorio",
            trecho: "normas da Associação Brasileira de Normas Técnicas … periódicas",
            fonteIds: ["bloco-1"],
          },
        ] as never;
      });
      expect(r.requisitosOperacionais["garantias"]?.["garantiaExecucao"]?.confirmado).toBe(true);
      expect(r.habilitacao["tecnicoOperacional"]?.[0]?.confirmado).toBe(true);
    });

    it("frase curta demais não prova nada", () => {
      const r = analisar((b) => {
        (b.prazosContatos.procedimentais as Record<string, unknown>)["recursos"] = {
          valor: "3 dias",
          trecho: "dias",
          fonteIds: ["bloco-1"],
        };
      });
      expect(r.prazosContatos["procedimentais"]?.["recursos"]?.confirmado).toBe(false);
    });
  });
});
