/**
 * CONVERSÃO DO CABEÇALHO DO PNCP PARA A LINHA DO CATÁLOGO.
 *
 * Cuidados exigidos pela especificação (arquivos 01 §4, 04 §2 e 08 §4):
 * - datas de proposta vêm sem offset e são horário de Brasília;
 * - CNPJ é texto e pode conter letras (v2.5 do manual);
 * - `situacaoCompraId` é declarado string no schema, mas chega número nas amostras;
 * - valor ausente/sigiloso permanece nulo — nunca vira zero;
 * - nada é inventado para campo ausente.
 */
import { classificarCategoria } from "@/lib/categoria";
import { calcularScore } from "@/lib/score";
import type { Configuracoes } from "@/lib/types";

export const FUSO_PNCP = "America/Sao_Paulo";

/** Subconjunto usado do cabeçalho retornado pelas três listagens. */
export interface ContratacaoPNCP {
  numeroControlePNCP?: string;
  orgaoEntidade?: {
    cnpj?: string;
    razaoSocial?: string;
    poderId?: string;
    esferaId?: string;
  } | null;
  orgaoSubRogado?: { cnpj?: string; razaoSocial?: string } | null;
  unidadeOrgao?: {
    ufSigla?: string;
    ufNome?: string;
    municipioNome?: string;
    codigoIbge?: string;
    codigoUnidade?: string;
    nomeUnidade?: string;
  } | null;
  unidadeSubRogada?: { codigoUnidade?: string; nomeUnidade?: string } | null;
  anoCompra?: number;
  sequencialCompra?: number;
  numeroCompra?: string;
  processo?: string;
  objetoCompra?: string;
  informacaoComplementar?: string | null;
  modalidadeId?: number | string | null;
  modalidadeNome?: string | null;
  modoDisputaId?: number | string | null;
  modoDisputaNome?: string | null;
  situacaoCompraId?: number | string | null;
  situacaoCompraNome?: string | null;
  srp?: boolean | null;
  valorTotalEstimado?: number | string | null;
  valorTotalHomologado?: number | string | null;
  dataPublicacaoPncp?: string | null;
  dataAberturaProposta?: string | null;
  dataEncerramentoProposta?: string | null;
  dataAtualizacaoGlobal?: string | null;
  dataAtualizacao?: string | null;
  linkSistemaOrigem?: string | null;
}

/** Linha do catálogo (colunas de `public.licitacoes`). */
export interface LicitacaoRow {
  numero_controle_pncp: string;
  cnpj_orgao: string;
  orgao: string;
  orgao_subrogado_cnpj: string | null;
  orgao_subrogado_nome: string | null;
  ano_compra: number | null;
  sequencial_compra: number | null;
  numero_compra: string | null;
  processo: string | null;
  unidade_nome: string | null;
  codigo_unidade: string | null;
  uf: string | null;
  municipio: string | null;
  codigo_ibge: string | null;
  objeto: string;
  informacao_complementar: string | null;
  modalidade_id: number | null;
  modalidade_nome: string | null;
  modo_disputa_id: number | null;
  situacao_compra_id: number | null;
  situacao_nome: string | null;
  srp: boolean | null;
  valor_total_estimado: number | null;
  data_publicacao: string | null;
  data_abertura_proposta: string | null;
  data_encerramento_proposta: string | null;
  data_atualizacao_global: string | null;
  link_sistema_origem: string | null;
  url_pncp: string | null;
  categoria: string;
  score_aderencia: number;
  source_hash: string;
  fetched_at: string;
  observado_em_proposta_at: string | null;
}

export class RegistroInvalidoError extends Error {
  constructor(motivo: string) {
    super(`Registro do PNCP inválido: ${motivo}`);
    this.name = "RegistroInvalidoError";
  }
}

const COM_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;
const SEM_OFFSET = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/;

/** Quanto o relógio da zona está adiantado em relação ao UTC naquele instante. */
function deslocamentoZonaMs(instante: Date, zona: string): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instante);

  const v = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? "0");
  const comoUtc = Date.UTC(
    v("year"),
    v("month") - 1,
    v("day"),
    v("hour") % 24,
    v("minute"),
    v("second"),
  );
  return comoUtc - instante.getTime();
}

/**
 * Texto de data do PNCP → instante UTC em ISO.
 * Sem offset, interpreta no fuso de Brasília (Manual de Consultas §6.4); com
 * offset explícito, respeita o que veio. Nunca concatena "Z" a horário local.
 */
export function paraInstanteUtc(
  texto: string | null | undefined,
  zona: string = FUSO_PNCP,
): string | null {
  if (!texto) return null;

  if (COM_OFFSET.test(texto)) {
    const d = new Date(texto);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  const m = SEM_OFFSET.exec(texto);
  if (!m) return null;

  const palpite = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] ?? 0),
  );
  // Duas passadas resolvem instantes próximos a mudanças de offset da zona.
  let ts = palpite - deslocamentoZonaMs(new Date(palpite), zona);
  ts = palpite - deslocamentoZonaMs(new Date(ts), zona);
  return new Date(ts).toISOString();
}

/** Hash estável do conteúdo de negócio, para detectar mudança real sem regravar. */
export function hashEstavel(valor: unknown): string {
  const texto = JSON.stringify(valor) ?? "";
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul((h2 + c) >>> 0, 0x85ebca6b) >>> 0;
    h2 = (h2 ^ (h2 >>> 13)) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

function inteiroOuNulo(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function decimalOuNulo(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

const texto = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

export type ConfigScore = Pick<
  Configuracoes,
  "palavras_chave" | "score_peso_palavras" | "score_peso_documentos" | "score_peso_valor"
>;

export interface OpcoesMapeamento {
  cfg: ConfigScore;
  /** Marca observação no endpoint de propostas abertas (arquivo 02 §7). */
  vistoEmProposta?: boolean;
  fetchedAt?: string;
}

export function mapearContratacao(
  dto: ContratacaoPNCP,
  { cfg, vistoEmProposta = false, fetchedAt = new Date().toISOString() }: OpcoesMapeamento,
): LicitacaoRow {
  const numeroControle = texto(dto.numeroControlePNCP);
  if (!numeroControle) {
    throw new RegistroInvalidoError("numeroControlePNCP ausente");
  }

  // CNPJ permanece exatamente como veio: zeros à esquerda e letras preservados.
  const cnpj = texto(dto.orgaoEntidade?.cnpj) ?? "";
  const objeto = texto(dto.objetoCompra) ?? "";
  const anoCompra = inteiroOuNulo(dto.anoCompra);
  const sequencialCompra = inteiroOuNulo(dto.sequencialCompra);
  const categoria = classificarCategoria(objeto);
  const valor = decimalOuNulo(dto.valorTotalEstimado);

  const conteudo = {
    numeroControle,
    cnpj,
    objeto,
    informacaoComplementar: texto(dto.informacaoComplementar),
    modalidadeId: inteiroOuNulo(dto.modalidadeId),
    modoDisputaId: inteiroOuNulo(dto.modoDisputaId),
    situacaoCompraId: inteiroOuNulo(dto.situacaoCompraId),
    srp: dto.srp ?? null,
    valor,
    publicacao: paraInstanteUtc(dto.dataPublicacaoPncp),
    abertura: paraInstanteUtc(dto.dataAberturaProposta),
    encerramento: paraInstanteUtc(dto.dataEncerramentoProposta),
    atualizacaoGlobal: paraInstanteUtc(dto.dataAtualizacaoGlobal ?? dto.dataAtualizacao),
    uf: texto(dto.unidadeOrgao?.ufSigla),
    municipio: texto(dto.unidadeOrgao?.municipioNome),
    codigoIbge: texto(dto.unidadeOrgao?.codigoIbge),
    codigoUnidade: texto(dto.unidadeOrgao?.codigoUnidade),
    orgao: texto(dto.orgaoEntidade?.razaoSocial),
    subrogado: texto(dto.orgaoSubRogado?.cnpj),
  };

  return {
    numero_controle_pncp: numeroControle,
    cnpj_orgao: cnpj,
    orgao: conteudo.orgao ?? "",
    orgao_subrogado_cnpj: texto(dto.orgaoSubRogado?.cnpj),
    orgao_subrogado_nome: texto(dto.orgaoSubRogado?.razaoSocial),
    ano_compra: anoCompra,
    sequencial_compra: sequencialCompra,
    numero_compra: texto(dto.numeroCompra),
    processo: texto(dto.processo),
    unidade_nome: texto(dto.unidadeOrgao?.nomeUnidade),
    codigo_unidade: conteudo.codigoUnidade,
    uf: conteudo.uf,
    municipio: conteudo.municipio,
    codigo_ibge: conteudo.codigoIbge,
    objeto,
    informacao_complementar: conteudo.informacaoComplementar,
    modalidade_id: conteudo.modalidadeId,
    modalidade_nome: texto(dto.modalidadeNome),
    modo_disputa_id: conteudo.modoDisputaId,
    situacao_compra_id: conteudo.situacaoCompraId,
    situacao_nome: texto(dto.situacaoCompraNome),
    srp: dto.srp ?? null,
    valor_total_estimado: valor,
    data_publicacao: conteudo.publicacao,
    data_abertura_proposta: conteudo.abertura,
    data_encerramento_proposta: conteudo.encerramento,
    data_atualizacao_global: conteudo.atualizacaoGlobal,
    link_sistema_origem: texto(dto.linkSistemaOrigem),
    url_pncp:
      cnpj && anoCompra !== null && sequencialCompra !== null
        ? `https://pncp.gov.br/app/editais/${cnpj}/${anoCompra}/${sequencialCompra}`
        : null,
    categoria,
    score_aderencia: calcularScore(
      {
        objeto,
        modalidade: texto(dto.modalidadeNome) ?? "",
        valor_estimado: valor,
        categoria,
        // Documentos chegam só na fase de enriquecimento; até lá o peso
        // documental fica zerado em vez de ser presumido.
        documentos: [],
      },
      cfg,
    ),
    source_hash: hashEstavel(conteudo),
    fetched_at: fetchedAt,
    observado_em_proposta_at: vistoEmProposta ? fetchedAt : null,
  };
}

/** Deduplica o lote por identidade canônica antes do merge (regra I08). */
export function deduplicarPorControle(linhas: LicitacaoRow[]): LicitacaoRow[] {
  const porChave = new Map<string, LicitacaoRow>();
  for (const linha of linhas) porChave.set(linha.numero_controle_pncp, linha);
  return [...porChave.values()];
}
