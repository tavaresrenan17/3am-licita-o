import { describe, expect, it } from "vitest";
import {
  parsearAnaliseResultado,
  validarFontes,
  type AnaliseResultado,
} from "./contrato";

describe("Contrato da Análise com Visão de Engenheiro Sênior", () => {
  it("faz parse de JSON estruturado contendo campos completos do Engenheiro Chefe", () => {
    const rawJson = JSON.stringify({
      veredito: "favoravel",
      confianca: "alta",
      resumoExecutivo: "Licitação atrativa de macrodrenagem urbana com orçamento equilibrado e projeto executivo consistente.",
      parecerEngenheiro: {
        decisao: "go",
        titulo: "Oportunidade Estratégica em Taubaté",
        justificativa: "Preços alinhados ao SINAPI e prazo confortável de 10 meses sem gargalo geológico grave.",
        atratividadeComercial: "alta",
        complexidadeOperacional: "media",
      },
      engenhariaCustos: {
        regimeExecucao: "Empreitada por Preço Unitário",
        alertaLinha75: "Corte máximo recomendado de 18% para não tangenciar a presunção de inexequibilidade (art. 59 §4º).",
        alertaLinha85: "Descontos acima de 15% exigirão aporte de garantia adicional em dinheiro/seguro (art. 59 §5º).",
        bdiSugerido: "22,5% conforme Acórdão TCU 2.622/2013",
        reajusteRegra: "Índice INCC/FGV a cada 12 meses a contar da data-base do orçamento.",
      },
      engenhariaHabilitacao: {
        parcelasRelevantes: ["Galeria celular de concreto armado >= 1.500m", "Escavação mecanizada >= 20.000m³"],
        catExigida: "CAT/CREA de engenheiro civil comprovando responsabilidade técnica em drenagem urbana.",
        pegadinhasHabilitacao: ["Exigência de visto no CREA-SP apenas para assinatura de contrato, não para habilitação."],
      },
      estrategiaImpugnacao: {
        pontosImpugnar: [],
        esclarecimentos: ["Confirmar se o bota-fora dista menos de 15km do canteiro."],
        documentosUrgentes: ["Renovação da CRF do FGTS (validade 30 dias)."],
      },
      pontosImportantes: [
        {
          titulo: "Orçamento com base SINAPI recente",
          descricao: "Planilha atualizada há menos de 3 meses, reduzindo defasagem inflacionária.",
          fonteIds: ["fonte-1"],
        },
      ],
      pontosAtencao: [
        {
          titulo: "Vistoria facultativa com declaração",
          descricao: "Permite declaração formal do responsável técnico conforme art. 63 IV.",
          severidade: "media",
          fonteIds: ["fonte-1"],
        },
      ],
      itensNaoImportantes: [
        {
          titulo: "Reconhecimento de firma em cartório",
          descricao: "Dispensado pela Lei 13.726/2018.",
          fonteIds: ["fonte-1"],
        },
      ],
      prazos: [
        {
          titulo: "Prazo de execução",
          descricao: "10 meses contados da Ordem de Serviço.",
          fonteIds: ["fonte-1"],
        },
      ],
      requisitos: [
        {
          titulo: "Patrimônio líquido",
          descricao: "Comprovação de 10% do valor estimado.",
          fonteIds: ["fonte-1"],
        },
      ],
      riscos: [
        {
          titulo: "Período chuvoso",
          descricao: "Planejar frentes de escavação para mitigar alagamento de valas.",
          severidade: "media",
          fonteIds: ["fonte-1"],
        },
      ],
      proximosPassos: [
        "Emitir certidão do FGTS",
        "Elaborar composição analítica de BDI",
      ],
    });

    const resultado = parsearAnaliseResultado(rawJson);
    expect(resultado.veredito).toBe("favoravel");
    expect(resultado.parecerEngenheiro?.decisao).toBe("go");
    expect(resultado.parecerEngenheiro?.atratividadeComercial).toBe("alta");
    expect(resultado.engenhariaCustos?.regimeExecucao).toBe("Empreitada por Preço Unitário");
    expect(resultado.engenhariaHabilitacao?.parcelasRelevantes).toHaveLength(2);
    expect(resultado.estrategiaImpugnacao?.documentosUrgentes).toHaveLength(1);

    const validado = validarFontes(resultado, [{ id: "fonte-1" }]);
    expect(validado).toBeDefined();
  });

  it("garante retrocompatibilidade se a IA responder sem os campos novos", () => {
    const jsonLegado = JSON.stringify({
      veredito: "atencao",
      confianca: "media",
      resumoExecutivo: "Análise padrão de edital.",
      pontosImportantes: [{ titulo: "Item", descricao: "Desc", fonteIds: ["f-1"] }],
      prazos: [{ titulo: "Prazo", descricao: "Desc", fonteIds: ["f-1"] }],
      requisitos: [{ titulo: "Req", descricao: "Desc", fonteIds: ["f-1"] }],
      riscos: [{ titulo: "Risco", descricao: "Desc", fonteIds: ["f-1"] }],
      proximosPassos: ["Ação"],
    });

    const resultado = parsearAnaliseResultado(jsonLegado);
    expect(resultado.veredito).toBe("atencao");
    expect(resultado.parecerEngenheiro).toBeUndefined();
    expect(resultado.pontosAtencao).toEqual([]);
  });
});
