import { z } from "zod";

export const PROMPT_VERSAO = "v1";
export const ALGORITMO_VERSAO = "v1";

export const TETO_CARACTERES_BLOCO = 12_000;
export const TETO_CARACTERES_LOTE = 48_000;
export const TETO_EVIDENCIAS_POR_TEMA = 8;

export const CONSULTAS_TEMATICAS = [
  { id: "escopo", consulta: "objeto escopo entregáveis quantidades locais de execução" },
  {
    id: "habilitacao",
    consulta: "documentos de habilitação jurídica fiscal trabalhista econômico-financeira",
  },
  {
    id: "qualificacao_tecnica",
    consulta: "qualificação técnica atestados acervo equipe responsável experiência mínima",
  },
  { id: "prazos", consulta: "prazos datas proposta execução vigência recursos impugnação" },
  {
    id: "julgamento_proposta",
    consulta: "critério de julgamento proposta preços planilha BDI exequibilidade desempate",
  },
  { id: "garantias", consulta: "garantia da proposta garantia contratual seguros caução" },
  { id: "sancoes", consulta: "sanções multas penalidades impedimento rescisão" },
  {
    id: "pagamento_reajuste",
    consulta: "pagamento medição reajuste repactuação retenções condições financeiras",
  },
  {
    id: "visitas_amostras",
    consulta: "visita técnica vistoria amostras prova de conceito obrigatoriedade",
  },
  {
    id: "consorcio_subcontratacao",
    consulta: "consórcio subcontratação participação limites autorização",
  },
] as const;

export type TemaAnalise = (typeof CONSULTAS_TEMATICAS)[number]["id"];

export const severidadeSchema = z.enum(["informativa", "baixa", "media", "alta", "critica"]);

export const itemCitavelSchema = z
  .object({
    titulo: z.string().trim().min(1),
    descricao: z.string().trim().min(1),
    severidade: severidadeSchema.optional(),
    fonteIds: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

export const analiseResultadoSchema = z
  .object({
    veredito: z.enum(["favoravel", "atencao", "desfavoravel", "insuficiente"]),
    confianca: z.enum(["alta", "media", "baixa"]),
    resumoExecutivo: z.string().trim().min(1),
    pontosImportantes: z.array(itemCitavelSchema),
    prazos: z.array(itemCitavelSchema),
    requisitos: z.array(itemCitavelSchema),
    riscos: z.array(itemCitavelSchema),
    proximosPassos: z.array(z.string().trim().min(1)),
  })
  .strict();

export type Severidade = z.infer<typeof severidadeSchema>;
export type ItemCitavel = z.infer<typeof itemCitavelSchema>;
export type AnaliseResultado = z.infer<typeof analiseResultadoSchema>;

export interface FonteConhecida {
  id: string;
}

export function parsearAnaliseResultado(json: string): AnaliseResultado {
  let valor: unknown;
  try {
    valor = JSON.parse(json);
  } catch {
    throw new Error("Resposta de análise não contém JSON válido");
  }

  const analisado = analiseResultadoSchema.safeParse(valor);
  if (!analisado.success) {
    throw new Error(`Resposta de análise viola o contrato: ${analisado.error.message}`);
  }
  return analisado.data;
}

export const parseAnaliseResultado = parsearAnaliseResultado;

export function validarFontes(
  resultado: AnaliseResultado,
  fontes: readonly FonteConhecida[],
): AnaliseResultado {
  const idsConhecidos = new Set(fontes.map((fonte) => fonte.id));
  const secoes = [
    resultado.pontosImportantes,
    resultado.prazos,
    resultado.requisitos,
    resultado.riscos,
  ];

  for (const item of secoes.flat()) {
    if (item.fonteIds.length === 0) {
      throw new Error(`Item citável "${item.titulo}" não possui fonte`);
    }
    for (const fonteId of item.fonteIds) {
      if (!idsConhecidos.has(fonteId)) {
        throw new Error(`Fonte desconhecida ou inventada: ${fonteId}`);
      }
    }
  }
  return resultado;
}

export const validarFonteIds = validarFontes;
