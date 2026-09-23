/**
 * EXTRAÇÃO DE DADOS ADICIONAIS DO EDITAL.
 *
 * Prazos comerciais, pregoeiro, contato e endereços não existem nos dados
 * estruturados do PNCP. Aqui fica a parte pura do processo — contrato do
 * resultado, recorte dos trechos relevantes e prompt —, sem rede nem banco.
 */
import { z } from "zod";

export const EXTRATOR_VERSAO = "v1";

/** Teto do texto enviado à IA: o suficiente para os trechos, barato por chamada. */
export const TETO_CARACTERES = 24_000;
const RAIO_TRECHO = 500;
const CARACTERES_PREAMBULO = 3_000;

const textoOuNulo = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v && !/^(-+|n\/?a|null|não informado)$/i.test(v) ? v : null));

export const dadosAdicionaisSchema = z.object({
  prazoEntrega: textoOuNulo,
  prazoPagamento: textoOuNulo,
  validadeProposta: textoOuNulo,
  pregoeiro: textoOuNulo,
  telefone: textoOuNulo,
  email: textoOuNulo,
  enderecos: z
    .array(z.object({ tipo: z.string().trim().min(1), endereco: z.string().trim().min(1) }))
    .nullish()
    .transform((v) => v ?? []),
});

export type DadosAdicionais = z.infer<typeof dadosAdicionaisSchema>;

export interface TextoDocumento {
  nome: string;
  tipo: string;
  texto: string;
}

// Âncoras de cada campo no texto do edital. Só os arredores delas vão à IA.
const ANCORAS = [
  /prazo\s+(?:m[áa]ximo\s+)?(?:de|para)\s+(?:a\s+)?entrega/gi,
  /prazo\s+(?:de|para)\s+(?:o\s+)?pagamento|pagamento\s+ser[áa]\s+(?:efetuado|realizado)/gi,
  /validade\s+(?:m[íi]nima\s+)?da\s+proposta/gi,
  /pregoeir[oa]|agente\s+de\s+contrata[çc][ãa]o/gi,
  /telefone|fone\s*:|\(\d{2}\)\s*\d{4,5}-?\d{4}/gi,
  /e-?mail|[\w.+-]+@[\w-]+\.[\w.]+/gi,
  /local\s+(?:de\s+)?entrega|endere[çc]o|situad[oa]\s+(?:na|no|à)/gi,
];

const PESO_TIPO: Record<string, number> = {
  edital: 0,
  anexo: 1,
  outro: 2,
  projeto: 3,
  orcamento: 4,
};

/**
 * Recorta os trechos do edital próximos das âncoras, mais o preâmbulo (onde
 * costumam estar pregoeiro e contato). Edital vem antes de anexos, e o total
 * respeita `TETO_CARACTERES`.
 */
export function selecionarTrechos(documentos: TextoDocumento[]): string {
  const ordenados = [...documentos].sort(
    (a, b) => (PESO_TIPO[a.tipo] ?? 9) - (PESO_TIPO[b.tipo] ?? 9),
  );
  const blocos: string[] = [];
  let usado = 0;

  for (const doc of ordenados) {
    const texto = doc.texto.replace(/[ \t]+/g, " ");
    const intervalos: [number, number][] = [[0, Math.min(CARACTERES_PREAMBULO, texto.length)]];
    for (const ancora of ANCORAS) {
      for (const m of texto.matchAll(ancora)) {
        const i = m.index ?? 0;
        intervalos.push([Math.max(0, i - RAIO_TRECHO), Math.min(texto.length, i + RAIO_TRECHO)]);
      }
    }
    intervalos.sort((a, b) => a[0] - b[0]);
    const unidos: [number, number][] = [];
    for (const atual of intervalos) {
      const ultimo = unidos[unidos.length - 1];
      if (ultimo && atual[0] <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], atual[1]);
      else unidos.push([...atual]);
    }

    const trechos: string[] = [];
    for (const [ini, fim] of unidos) {
      const trecho = texto.slice(ini, fim).trim();
      if (usado + trecho.length > TETO_CARACTERES) break;
      trechos.push(trecho);
      usado += trecho.length;
    }
    if (trechos.length > 0) {
      blocos.push(`### Documento: ${doc.nome} (${doc.tipo})\n${trechos.join("\n[…]\n")}`);
    }
    if (usado >= TETO_CARACTERES) break;
  }
  return blocos.join("\n\n");
}

export function montarPrompt(trechos: string): string {
  return [
    "Extraia do edital abaixo os dados comerciais e de contato da licitação.",
    "Responda SOMENTE com um objeto JSON com exatamente estas chaves:",
    '{"prazoEntrega": string|null, "prazoPagamento": string|null, "validadeProposta": string|null,',
    ' "pregoeiro": string|null, "telefone": string|null, "email": string|null,',
    ' "enderecos": [{"tipo": string, "endereco": string}]}',
    "",
    "Regras:",
    '- Prazos curtos e diretos, como aparecem no edital (ex.: "5 dias", "30 dias após o atesto", "60 dias").',
    "- pregoeiro: nome da pessoa designada como pregoeiro(a) ou agente de contratação.",
    '- telefone e email: contato do setor de licitações/pregoeiro. Se houver vários, separe por " / ".',
    '- enderecos: locais citados no edital; "tipo" diz o papel (ex.: "Entrega", "Sessão", "Protocolo", "Órgão").',
    "- Use null (ou lista vazia) quando o dado não estiver no texto. Nunca invente.",
    "",
    "Texto do edital (trechos):",
    trechos,
  ].join("\n");
}

export function parsearDadosAdicionais(json: string): DadosAdicionais {
  let valor: unknown;
  try {
    valor = JSON.parse(json);
  } catch {
    throw new Error("A IA não devolveu JSON válido para os dados adicionais");
  }
  const r = dadosAdicionaisSchema.safeParse(valor);
  if (!r.success) {
    throw new Error(`Dados adicionais fora do formato esperado: ${r.error.message}`);
  }
  return r.data;
}
