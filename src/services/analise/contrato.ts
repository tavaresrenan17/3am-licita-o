import { z } from "zod";
import type { FatosPncp } from "./fatos";

/**
 * v3 (24/09/2026): a análise só extrai dados. Sai o veredito "go / no-go":
 * sem conhecer a empresa, a IA recomendou consultas médicas e conexões de água.
 * Entram os itens do PNCP no contexto e os fatos do certame calculados pelo
 * sistema. Análises v1 e v2 ficam como formato antigo e podem ser refeitas.
 */
export const PROMPT_VERSAO = "v3";
export const ALGORITMO_VERSAO = "v1";

export const TETO_CARACTERES_BLOCO = 12_000;
export const TETO_CARACTERES_LOTE = 48_000;
export const TETO_EVIDENCIAS_POR_TEMA = 8;

export const CONSULTAS_TEMATICAS = [
  {
    id: "escopo",
    consulta: "objeto escopo entregáveis quantidades locais de execução SINAPI SICRO regime",
  },
  {
    id: "habilitacao",
    consulta:
      "documentos de habilitação jurídica fiscal trabalhista econômico-financeira CRF FGTS 30 dias CNDT certidões RFB PGFN SEFAZ ISS balanço patrimonial DRE falência patrimônio líquido",
  },
  {
    id: "qualificacao_tecnica",
    consulta:
      "qualificação técnica atestados acervo técnico CAT CREA CAU certificações ABNT INMETRO ISO normas técnicas declaração do fabricante manuais",
  },
  {
    id: "prazos",
    consulta:
      "prazos validade da proposta proposta ajustada recursos contrarrazões assinatura do contrato impugnação esclarecimento dias úteis corridos",
  },
  {
    id: "julgamento_proposta",
    consulta:
      "critério de julgamento menor preço por item lote global desconto inexequibilidade 75% exequibilidade ME EPP preferência empate ficto",
  },
  {
    id: "garantias",
    consulta:
      "garantia da proposta garantia de execução percentual modalidades caução seguro fiança garantia do produto on-site balcão",
  },
  { id: "sancoes", consulta: "sanções multas penalidades impedimento de licitar inidoneidade" },
  {
    id: "pagamento_reajuste",
    consulta:
      "pagamento prazo de pagamento dias após entrega nota fiscal reajuste índice repactuação",
  },
  {
    id: "visitas_amostras",
    consulta:
      "visita técnica vistoria amostra catálogo folder prospecto demonstração prova de conceito atendimento ponto a ponto",
  },
  {
    id: "consorcio_subcontratacao",
    consulta:
      "consórcio responsabilidade solidária subcontratação limites autorização empresa líder",
  },
  {
    id: "contatos",
    consulta:
      "pregoeiro agente de contratação comissão de licitação telefone e-mail horário de atendimento endereço",
  },
  {
    id: "lances",
    consulta:
      "lances intervalo mínimo entre lances redução mínima casas decimais modo de disputa aberto fechado valor máximo aceitável",
  },
  {
    id: "entrega_instalacao",
    consulta:
      "local de entrega endereço CEP prazo de entrega ordem de fornecimento instalação treinamento assistência técnica SLA",
  },
] as const;

export type TemaAnalise = (typeof CONSULTAS_TEMATICAS)[number]["id"];

/* ---------------------------------------------------- catálogo das 3 partes --- */

/**
 * Fonte única dos campos das três partes: o schema, o prompt e a tela saem
 * daqui, então um campo não tem como existir num lugar e faltar no outro.
 */
export interface DefCampo {
  chave: string;
  rotulo: string;
  /** O que a IA deve procurar no edital para preencher o campo. */
  instrucao: string;
}

export interface DefSecaoCampos {
  chave: string;
  titulo: string;
  campos: readonly DefCampo[];
}

export interface DefSecaoDocumentos {
  chave: string;
  titulo: string;
  instrucao: string;
}

const c = (chave: string, rotulo: string, instrucao: string): DefCampo => ({
  chave,
  rotulo,
  instrucao,
});

export const PARTE1_PRAZOS_CONTATOS: readonly DefSecaoCampos[] = [
  {
    chave: "procedimentais",
    titulo: "Prazos procedimentais",
    campos: [
      c(
        "validadeProposta",
        "Validade da proposta",
        "por quanto tempo a proposta deve permanecer válida (duração, ex.: 60 dias) — não confundir com a data limite para envio da proposta",
      ),
      c(
        "propostaAjustada",
        "Proposta ajustada",
        "tempo para enviar a proposta com preço ajustado ao lance vencedor",
      ),
      c("recursos", "Recursos", "tempo para interpor recurso contra decisões"),
      c("contrarrazoes", "Contrarrazões", "tempo para apresentar contrarrazões ao recurso"),
      c("assinaturaContrato", "Assinatura do contrato", "tempo para assinar após a convocação"),
      c("vistoriaTecnica", "Vistoria técnica", "prazo limite para realizar a vistoria"),
      c("impugnacao", "Impugnação do edital", "prazo para impugnar o edital"),
    ],
  },
  {
    chave: "comerciais",
    titulo: "Prazos comerciais",
    campos: [
      c("pagamento", "Pagamento", 'condições e prazo, ex.: "30 dias após a entrega"'),
      c("entrega", "Entrega", "tempo para entregar após a ordem de fornecimento"),
      c("garantia", "Garantia dos produtos/serviços", "prazo de garantia"),
      c("execucaoContrato", "Execução do contrato", "duração total do contrato"),
      c("slaAtendimento", "SLA de atendimento", "tempo de resposta para garantia ou suporte"),
    ],
  },
  {
    chave: "pregoeiro",
    titulo: "Pregoeiro",
    campos: [
      c("nome", "Nome", "nome do pregoeiro ou agente de contratação"),
      c("telefone", "Telefone", "telefone com DDD"),
      c("email", "E-mail", "e-mail de contato"),
      c("horario", "Horário de atendimento", "horário de atendimento"),
    ],
  },
  {
    chave: "comissao",
    titulo: "Comissão de licitação",
    campos: [
      c("responsavel", "Responsável", "responsável pela comissão ou setor de licitações"),
      c("telefone", "Telefone", "telefone com DDD"),
      c("email", "E-mail", "e-mail de contato"),
      c("endereco", "Endereço", "endereço completo"),
    ],
  },
];

export const PARTE2_HABILITACAO: readonly DefSecaoDocumentos[] = [
  {
    chave: "fiscalTributario",
    titulo: "Fiscal / tributário",
    instrucao:
      "certidões federais (RFB, PGFN, INSS), estaduais (SEFAZ) e municipais (ISS); FGTS e trabalhistas (CRF, CNDT); consultas que o órgão fará (CEIS, CNEP, TCU)",
  },
  {
    chave: "economicoFinanceiro",
    titulo: "Econômico / financeiro",
    instrucao:
      "exigências sobre balanço patrimonial; demonstrações contábeis (DRE, DMPL); certidão negativa de falência e recuperação judicial; patrimônio líquido",
  },
  {
    chave: "juridicoDocumental",
    titulo: "Jurídico / documental",
    instrucao:
      "habilitação jurídica; registro empresarial, contrato social, alvarás; atestados de capacidade técnica; declarações obrigatórias (ME/EPP, impedimentos etc.); comprovações de regularidade da atividade",
  },
  {
    chave: "tecnicoOperacional",
    titulo: "Técnico / operacional",
    instrucao:
      "certificações obrigatórias (ABNT, INMETRO, ISO); manuais a fornecer; certificados do produto; normas técnicas a atender; declarações do fabricante; documentação técnica adicional",
  },
];

export const PARTE3_REQUISITOS: readonly DefSecaoCampos[] = [
  {
    chave: "amostras",
    titulo: "Amostras e demonstração",
    campos: [
      c(
        "amostraFisica",
        "Amostra física obrigatória?",
        "se exige amostra física e em que condições",
      ),
      c("catalogoFolder", "Catálogo/folder obrigatório?", "se exige catálogo, folder ou prospecto"),
      c(
        "pontoAPonto",
        "Atendimento ponto a ponto?",
        "se exige comprovar ponto a ponto as especificações",
      ),
      c(
        "demonstracoes",
        "Demonstrações técnicas",
        "quais demonstrações técnicas ou provas de conceito são exigidas",
      ),
    ],
  },
  {
    chave: "entrega",
    titulo: "Entrega e instalação",
    campos: [
      c("localPrincipal", "Local principal de entrega", "local principal de entrega"),
      c("instalacao", "Instalação pelo fornecedor?", "se o fornecedor deve instalar"),
      c("treinamento", "Treinamento", "se exige treinamento e de quais tipos"),
      c("vistoria", "Vistoria técnica obrigatória?", "se a vistoria é obrigatória e onde"),
    ],
  },
  {
    chave: "lances",
    titulo: "Lances e negociação",
    campos: [
      c(
        "reducaoMinima",
        "Redução mínima entre lances",
        "valor ou percentual mínimo de redução entre lances",
      ),
      c("casasDecimais", "Casas decimais", "número de casas decimais permitidas"),
      c(
        "intervaloMinimo",
        "Intervalo mínimo entre lances",
        "intervalo mínimo de tempo entre lances",
      ),
      c("baseCalculo", "Base de cálculo", "se o lance é sobre o valor unitário ou total"),
      c("formaEnvio", "Forma de envio dos lances", "forma e modo de disputa dos lances"),
      c("valorMaximo", "Valor máximo aceitável", "valor máximo aceitável ou estimado"),
    ],
  },
  {
    chave: "garantias",
    titulo: "Garantias",
    campos: [
      c(
        "garantiaProposta",
        "Garantia de proposta",
        "se é exigida, percentual e modalidades aceitas",
      ),
      c(
        "garantiaExecucao",
        "Garantia de execução",
        "se é exigida, percentual e modalidades aceitas",
      ),
      c("tipoGarantia", "Tipo de garantia", "balcão, on-site etc."),
      c("prestador", "Quem presta a garantia", "fabricante ou contratada"),
      c("cobertura", "O que está coberto", "o que a garantia cobre"),
    ],
  },
  {
    chave: "julgamento",
    titulo: "Critérios de julgamento",
    campos: [
      c("criterio", "Critério", "menor preço, melhor técnica, técnica e preço etc."),
      c("forma", "Forma de julgamento", "por item, por lote ou global"),
      c("descontoLinear", "Aceita desconto linear?", "se aceita desconto linear"),
      c("preferenciaMeEpp", "Preferência ME/EPP", "percentual de preferência para ME/EPP"),
      c(
        "beneficiosMeEpp",
        "Benefícios ME/EPP",
        "benefícios para ME/EPP (cota reservada, exclusividade, empate ficto etc.)",
      ),
    ],
  },
  {
    chave: "comercial",
    titulo: "Aspectos comerciais",
    campos: [
      c(
        "envioProposta",
        "Como enviar a proposta",
        "sistema ou e-mail usado para enviar a proposta",
      ),
      c(
        "camposObrigatorios",
        "Campos obrigatórios no sistema",
        "campos que devem ser preenchidos no sistema",
      ),
      c("anexos", "Anexos necessários", "anexos exigidos com a proposta (catálogo, folder etc.)"),
      c("condicoesPagamento", "Condições de pagamento", "condições de pagamento"),
    ],
  },
  {
    chave: "exequibilidade",
    titulo: "Exequibilidade",
    campos: [
      c(
        "percentualMinimo",
        "Percentual mínimo",
        "percentual mínimo para não ser considerado inexequível",
      ),
      c("criterios", "Critérios de análise", "critérios de análise de exequibilidade"),
      c("comprovacao", "Como comprovar", "como comprovar a exequibilidade do preço"),
    ],
  },
];

/* ------------------------------------------------------------------ schemas --- */

export const severidadeSchema = z.enum(["informativa", "baixa", "media", "alta", "critica"]);

export const itemCitavelSchema = z
  .object({
    titulo: z.string().trim().min(1),
    descricao: z.string().trim().min(1),
    severidade: severidadeSchema.optional(),
    fonteIds: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

export const parecerEngenheiroSchema = z
  .object({
    decisao: z.enum(["go", "go_com_ressalvas", "no_go"]).optional(),
    titulo: z.string().trim().optional(),
    justificativa: z.string().trim().optional(),
    atratividadeComercial: z.enum(["alta", "media", "baixa"]).optional(),
    complexidadeOperacional: z.enum(["baixa", "media", "alta", "critica"]).optional(),
  })
  .strict();

/**
 * Só as formas de "o edital não diz". "Não exigido" e "Nenhum" ficam: são
 * respostas do edital (ex.: amostra não exigida), não ausência de informação.
 */
const NAO_INFORMADO =
  /^(-+|n\/?a|null|não (informad|mencionad|consta|especificad|localizad|encontrad)\w*.*|sem informaç\w+.*)$/i;

const fonteIdsSchema = z
  .array(z.string().trim().min(1))
  .nullish()
  .transform((v) => v ?? []);

const trechoSchema = z
  .string()
  .trim()
  .nullish()
  .transform((v) => v || null);

/**
 * Valor extraído do edital, com a frase literal que o sustenta e as fontes;
 * null quando o edital não informa. `confirmado` só vira true depois que
 * `confirmarTrechos` acha a frase no texto do documento.
 */
const campoSchema = z.preprocess(
  (bruto) => {
    if (bruto === undefined || bruto === null) return null;
    if (typeof bruto === "string") return { valor: bruto };
    return bruto;
  },
  z
    .object({ valor: z.string().trim().nullish(), trecho: trechoSchema, fonteIds: fonteIdsSchema })
    .nullable()
    .transform((v) =>
      v && v.valor && !NAO_INFORMADO.test(v.valor)
        ? { valor: v.valor, trecho: v.trecho, fonteIds: v.fonteIds, confirmado: false }
        : null,
    ),
);

export type CampoExtraido = {
  valor: string;
  trecho: string | null;
  fonteIds: string[];
  confirmado: boolean;
};

function secaoCamposSchema(def: DefSecaoCampos) {
  const forma = Object.fromEntries(def.campos.map((campo) => [campo.chave, campoSchema]));
  return z.preprocess((v) => v ?? {}, z.object(forma)) as unknown as z.ZodType<
    Record<string, CampoExtraido | null>
  >;
}

function parteCamposSchema(secoes: readonly DefSecaoCampos[]) {
  const forma = Object.fromEntries(secoes.map((s) => [s.chave, secaoCamposSchema(s)]));
  return z.preprocess((v) => v ?? {}, z.object(forma)) as unknown as z.ZodType<
    Record<string, Record<string, CampoExtraido | null>>
  >;
}

export const documentoExigidoSchema = z
  .object({
    documento: z.string().trim().min(1),
    detalhe: z
      .string()
      .trim()
      .nullish()
      .transform((v) => v || null),
    exigencia: z.enum(["obrigatorio", "alternativo", "condicional"]).catch("obrigatorio"),
    trecho: trechoSchema,
    fonteIds: fonteIdsSchema,
  })
  .transform((d) => ({ ...d, confirmado: false as boolean }));

export type DocumentoExigido = z.infer<typeof documentoExigidoSchema>;

const listaDocumentosSchema = z
  .array(documentoExigidoSchema)
  .nullish()
  .transform((v) => v ?? []);

const habilitacaoSchema = z.preprocess(
  (v) => v ?? {},
  z.object(Object.fromEntries(PARTE2_HABILITACAO.map((s) => [s.chave, listaDocumentosSchema]))),
) as unknown as z.ZodType<Record<string, DocumentoExigido[]>>;

export const enderecoEntregaSchema = z.object({
  endereco: z.string().trim().min(1),
  cep: z
    .string()
    .trim()
    .nullish()
    .transform((v) => v || null),
  cidade: z
    .string()
    .trim()
    .nullish()
    .transform((v) => v || null),
  uf: z
    .string()
    .trim()
    .nullish()
    .transform((v) => v || null),
  fonteIds: fonteIdsSchema,
});

export type EnderecoEntrega = z.infer<typeof enderecoEntregaSchema>;

/**
 * Chaves que o modelo não envia e o `z.object` descarta (inclusive veredito e
 * parecer de respostas no molde antigo). `fatosPncp` e `alertasSistema` saem
 * vazios do parse: quem os preenche é o orquestrador, com dados do PNCP.
 */
export const analiseResultadoSchema = z
  .object({
    resumoExecutivo: z.string().trim().min(1),
    prazosContatos: parteCamposSchema(PARTE1_PRAZOS_CONTATOS),
    habilitacao: habilitacaoSchema,
    requisitosOperacionais: parteCamposSchema(PARTE3_REQUISITOS),
    enderecosEntrega: z
      .array(enderecoEntregaSchema)
      .nullish()
      .transform((v) => v ?? []),
  })
  .transform((r) => ({
    formato: "v3" as const,
    ...r,
    fatosPncp: null as FatosPncp | null,
    alertasSistema: [] as string[],
  }));

export type AnaliseResultado = z.infer<typeof analiseResultadoSchema>;
export type ParecerEngenheiro = z.infer<typeof parecerEngenheiroSchema>;
export type Severidade = z.infer<typeof severidadeSchema>;
export type ItemCitavel = z.infer<typeof itemCitavelSchema>;

type Veredito = "favoravel" | "atencao" | "desfavoravel" | "insuficiente";
type Confianca = "alta" | "media" | "baixa";

/**
 * Formato v2 (23/09/2026), só para LER: três partes com veredito e parecer.
 * Refeito pelo botão "Refazer análise".
 */
export interface AnaliseResultadoV2 {
  formato: "v2";
  veredito: Veredito;
  confianca: Confianca;
  resumoExecutivo: string;
  parecerEngenheiro?: ParecerEngenheiro;
}

/**
 * Formato v1, só para LER análises salvas antes de 23/09/2026. Nenhuma análise
 * nova é gerada nele; a tela oferece "Refazer análise" quando encontra um.
 */
export interface AnaliseResultadoV1 {
  formato?: undefined;
  veredito: Veredito;
  confianca: Confianca;
  resumoExecutivo: string;
  pontosImportantes: ItemCitavel[];
  pontosAtencao?: ItemCitavel[];
  itensNaoImportantes?: ItemCitavel[];
  prazos: ItemCitavel[];
  requisitos: ItemCitavel[];
  riscos: ItemCitavel[];
  proximosPassos: string[];
  parecerEngenheiro?: ParecerEngenheiro;
  engenhariaCustos?: {
    regimeExecucao?: string;
    alertaLinha75?: string;
    alertaLinha85?: string;
    bdiSugerido?: string;
    reajusteRegra?: string;
  };
  engenhariaHabilitacao?: {
    parcelasRelevantes?: string[];
    catExigida?: string;
    pegadinhasHabilitacao?: string[];
  };
  estrategiaImpugnacao?: {
    pontosImpugnar?: string[];
    esclarecimentos?: string[];
    documentosUrgentes?: string[];
  };
}

export type AnaliseResultadoSalvo = AnaliseResultado | AnaliseResultadoV2 | AnaliseResultadoV1;

export const ehFormatoAtual = (
  r: AnaliseResultadoSalvo | null | undefined,
): r is AnaliseResultado => r?.formato === "v3";

export interface FonteConhecida {
  id: string;
}

export function parsearAnaliseResultado(json: string): AnaliseResultado {
  let valor: unknown;
  try {
    valor = JSON.parse(json);
  } catch {
    // O começo da resposta fica no erro salvo: é o que permite diagnosticar
    // a falha intermitente vista em 24/09/2026 (1 em 5, sem corte de saída).
    const inicio = json.trim().slice(0, 120).replace(/\s+/g, " ");
    throw new Error(`Resposta de análise não contém JSON válido (início: "${inicio}")`);
  }

  if (valor && typeof valor === "object" && !Array.isArray(valor)) {
    const obj = valor as Record<string, unknown>;
    for (const envelope of ["AnaliseResultado", "analiseResultado", "resultado", "analise"]) {
      if (obj[envelope] && typeof obj[envelope] === "object") {
        valor = obj[envelope];
        break;
      }
    }
  }

  const analisado = analiseResultadoSchema.safeParse(valor);
  if (!analisado.success) {
    throw new Error(`Resposta de análise viola o contrato: ${analisado.error.message}`);
  }
  return analisado.data;
}

export const parseAnaliseResultado = parsearAnaliseResultado;

function filtrarFonteIds(valor: unknown, conhecidos: Set<string>): number {
  let descartadas = 0;
  if (Array.isArray(valor)) {
    for (const item of valor) descartadas += filtrarFonteIds(item, conhecidos);
  } else if (valor && typeof valor === "object") {
    const obj = valor as Record<string, unknown>;
    for (const [chave, item] of Object.entries(obj)) {
      if (chave === "fonteIds" && Array.isArray(item)) {
        const validas = item.filter((id) => typeof id === "string" && conhecidos.has(id));
        descartadas += item.length - validas.length;
        obj[chave] = validas;
      } else {
        descartadas += filtrarFonteIds(item, conhecidos);
      }
    }
  }
  return descartadas;
}

/**
 * Descarta fonteIds que não existem no contexto enviado. Em v1 uma fonte
 * inventada derrubava a análise inteira; com dezenas de campos, isso jogaria
 * fora minutos de processamento por um único id errado. O valor continua e
 * a tela o mostra sem citação.
 */
export function validarFontes(
  resultado: AnaliseResultado,
  fontes: readonly FonteConhecida[],
): AnaliseResultado {
  filtrarFonteIds(resultado, new Set(fontes.map((fonte) => fonte.id)));
  return resultado;
}

export const validarFonteIds = validarFontes;

/**
 * Normaliza para comparar a frase citada com o texto extraído do PDF: sem
 * acento, sem caixa, sem hifenização de quebra de linha e sem pontuação.
 */
export function normalizarParaComparar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/(\w)-\s+(\w)/g, "$1$2")
    .replace(/[^a-z0-9%$]+/g, " ")
    .trim();
}

/** Trechos menores que isso casam em qualquer lugar e não provam nada. */
const MINIMO_CARACTERES_TRECHO = 12;

/** Resposta negativa: só vale com frase do edital que diga isso. */
const RESPOSTA_NEGATIVA = /^(não|nao|nenhum|nenhuma|sem |inexist|dispensad|isent)/i;

/** A própria frase citada admite que o edital é omisso. */
const TRECHO_ADMITE_SILENCIO =
  /^(não|nao) (se menciona|há menção|ha mencao|consta|é mencionad|e mencionad|foi mencionad|foram mencionad)|^o edital não (menciona|informa|prevê|preve)/i;

function pedacosDoTrecho(trecho: string): string[] {
  // O modelo pula partes com reticências e insere palavras entre colchetes:
  // cada pedaço fora disso precisa existir no texto.
  return trecho
    .split(/\[[^\]]*\]|\(\.\.\.\)|\.{3}|…/)
    .map(normalizarParaComparar)
    .filter((p) => p.length > 0);
}

/**
 * Confere se a frase citada em cada campo e documento existe de fato no texto
 * da licitação, e corrige a fonte quando ela está em outro bloco.
 *
 * Medido em 23/09/2026 num pregão real (gpt-4o-mini, 21 blocos, 48 frases):
 * 29 frases existiam mas com o bloco errado (0 citações de bloco corretas) e
 * 19 não existiam — em geral "Não se exige treinamento/amostra/vistoria"
 * inventado para preencher o que o edital nem menciona. Por isso a busca vai
 * ao texto inteiro, e negativa sem frase confirmada volta a ser "não informado".
 */
export function confirmarTrechos(
  resultado: AnaliseResultado,
  textosPorFonte: ReadonlyMap<string, string>,
): AnaliseResultado {
  const fontes = [...textosPorFonte].map(
    ([id, texto]) => [id, normalizarParaComparar(texto)] as const,
  );

  const localizar = (trecho: string, citados: readonly string[]): string | null => {
    const pedacos = pedacosDoTrecho(trecho);
    if (pedacos.length === 0 || pedacos.join(" ").length < MINIMO_CARACTERES_TRECHO) return null;
    const contem = ([, texto]: readonly [string, string]) =>
      pedacos.every((p) => texto.includes(p));
    const noCitado = fontes.find((f) => citados.includes(f[0]) && contem(f));
    return (noCitado ?? fontes.find(contem))?.[0] ?? null;
  };

  const confirmar = (item: { trecho: string | null; fonteIds: string[]; confirmado: boolean }) => {
    if (!item.trecho) return;
    const onde = localizar(item.trecho, item.fonteIds);
    item.confirmado = onde !== null;
    if (onde && !item.fonteIds.includes(onde)) item.fonteIds = [onde];
  };

  for (const parte of [resultado.prazosContatos, resultado.requisitosOperacionais]) {
    for (const secao of Object.values(parte)) {
      for (const [chave, campo] of Object.entries(secao)) {
        if (!campo) continue;
        if (campo.trecho && TRECHO_ADMITE_SILENCIO.test(campo.trecho.trim())) {
          secao[chave] = null;
          continue;
        }
        confirmar(campo);
        if (!campo.confirmado && RESPOSTA_NEGATIVA.test(campo.valor.trim())) secao[chave] = null;
      }
    }
  }
  for (const lista of Object.values(resultado.habilitacao)) lista.forEach(confirmar);
  return resultado;
}
