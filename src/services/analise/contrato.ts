import { z } from "zod";

export const PROMPT_VERSAO = "v1";
export const ALGORITMO_VERSAO = "v1";

export const TETO_CARACTERES_BLOCO = 12_000;
export const TETO_CARACTERES_LOTE = 48_000;
export const TETO_EVIDENCIAS_POR_TEMA = 8;

export const CONSULTAS_TEMATICAS = [
  { id: "escopo", consulta: "objeto escopo entregáveis quantidades locais de execução SINAPI SICRO regime" },
  {
    id: "habilitacao",
    consulta: "documentos de habilitação jurídica fiscal trabalhista econômico-financeira CRF FGTS 30 dias falência certidões patrimônio líquido 10%",
  },
  {
    id: "qualificacao_tecnica",
    consulta: "qualificação técnica atestados acervo técnico CAT CREA CAU quantitativos Súmula TCU 263 responsável técnico disponibilidade",
  },
  { id: "prazos", consulta: "prazos datas proposta execução vigência recursos impugnação 3 dias úteis esclarecimento publicação PNCP" },
  {
    id: "julgamento_proposta",
    consulta: "critério de julgamento proposta preços planilha BDI inexequibilidade 75% desempate ME EPP empate ficto cota reservada 80 mil",
  },
  { id: "garantias", consulta: "garantia da proposta até 1% garantia execução 5% a 10% garantia adicional abaixo de 85% seguro retomada 30%" },
  { id: "sancoes", consulta: "sanções multas 0,5% a 30% penalidades impedimento de licitar 3 anos inidoneidade 3 a 6 anos defesa 15 dias" },
  {
    id: "pagamento_reajuste",
    consulta: "pagamento ordem cronológica medição reajuste índice anual obrigatório art 25 repactuação reequilíbrio atraso 2 meses suspensão",
  },
  {
    id: "visitas_amostras",
    consulta: "visita técnica vistoria obrigatória alternativa declaração responsável conhecimento local amostras prova conceito art 63 IV",
  },
  {
    id: "consorcio_subcontratacao",
    consulta: "consórcio responsabilidade solidária subcontratação limites autorização empresa líder",
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
    pontosAtencao: z.array(itemCitavelSchema).optional().default([]),
    itensNaoImportantes: z.array(itemCitavelSchema).optional().default([]),
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

  if (valor && typeof valor === "object" && !Array.isArray(valor)) {
    const obj = valor as Record<string, unknown>;
    if (obj["AnaliseResultado"] && typeof obj["AnaliseResultado"] === "object") {
      valor = obj["AnaliseResultado"];
    } else if (obj["analiseResultado"] && typeof obj["analiseResultado"] === "object") {
      valor = obj["analiseResultado"];
    } else if (obj["resultado"] && typeof obj["resultado"] === "object") {
      valor = obj["resultado"];
    } else if (obj["analise"] && typeof obj["analise"] === "object") {
      valor = obj["analise"];
    }
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
    resultado.pontosAtencao ?? [],
    resultado.itensNaoImportantes ?? [],
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
