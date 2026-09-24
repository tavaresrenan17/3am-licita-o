/**
 * Resposta do modelo no formato v3 (resumo + três partes, sem veredito), como
 * chega antes do parse.
 */
export function respostaV3(fonteId: string) {
  const f = [fonteId];
  return {
    resumoExecutivo:
      "Pregão eletrônico para aquisição de 120 conjuntos de mobiliário escolar, valor estimado de R$ 96.000,00, entrega em 20 dias em 3 escolas de São Paulo/SP.",
    prazosContatos: {
      procedimentais: {
        validadeProposta: {
          valor: "60 dias corridos",
          trecho: "A proposta terá validade de 60 (sessenta) dias corridos",
          fonteIds: f,
        },
        recursos: { valor: "3 dias úteis após a intenção de recurso", fonteIds: f },
        impugnacao: { valor: "Até 3 dias úteis antes da abertura", fonteIds: f },
        vistoriaTecnica: null,
      },
      comerciais: {
        pagamento: { valor: "30 dias após o recebimento definitivo", fonteIds: f },
        entrega: { valor: "20 dias corridos após a ordem de fornecimento", fonteIds: f },
      },
      pregoeiro: {
        nome: { valor: "Maria Souza", fonteIds: f },
        telefone: { valor: "(11) 4000-1234", fonteIds: f },
        email: { valor: "licitacao@prefeitura.sp.gov.br", fonteIds: f },
      },
      comissao: {},
    },
    habilitacao: {
      fiscalTributario: [
        { documento: "CND conjunta RFB/PGFN", exigencia: "obrigatorio", fonteIds: f },
        {
          documento: "CRF do FGTS",
          detalhe: "válida na data da sessão",
          exigencia: "obrigatorio",
          fonteIds: f,
        },
      ],
      economicoFinanceiro: [
        {
          documento: "Balanço patrimonial do último exercício",
          exigencia: "obrigatorio",
          fonteIds: f,
        },
      ],
      juridicoDocumental: [
        { documento: "Declaração de ME/EPP", exigencia: "condicional", fonteIds: f },
      ],
      tecnicoOperacional: [],
    },
    requisitosOperacionais: {
      amostras: {
        amostraFisica: { valor: "Sim, em até 5 dias úteis após convocação", fonteIds: f },
        catalogoFolder: { valor: "Não exigido", fonteIds: f },
      },
      entrega: {
        localPrincipal: { valor: "Almoxarifado Central", fonteIds: f },
        instalacao: { valor: "Sim, montagem no local", fonteIds: f },
      },
      lances: {
        intervaloMinimo: { valor: "R$ 0,50 entre lances", fonteIds: f },
        formaEnvio: { valor: "Modo de disputa aberto", fonteIds: f },
      },
      garantias: {
        garantiaExecucao: { valor: "Não exigida", fonteIds: f },
      },
      julgamento: {
        criterio: { valor: "Menor preço", fonteIds: f },
        forma: { valor: "Por lote", fonteIds: f },
      },
      comercial: {},
      exequibilidade: {
        percentualMinimo: null,
      },
    },
    enderecosEntrega: [
      {
        endereco: "Rua das Escolas, 100",
        cep: "01000-000",
        cidade: "São Paulo",
        uf: "SP",
        fonteIds: f,
      },
    ],
  };
}
