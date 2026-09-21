/**
 * PLANEJADOR DE SEGMENTOS DE COLETA.
 *
 * Traduz o escopo configurado pela equipe (UFs, modalidades, horizonte) nas
 * requisições que o PNCP realmente aceita. Regras da especificação (arquivo 02):
 * - parâmetros são escalares: "SP ou MG" vira união de segmentos, nunca `uf=SP,MG`;
 * - em `/contratacoes/proposta` a modalidade pode ser omitida, e omitir é melhor
 *   que multiplicar segmentos quando se deseja todas;
 * - o horizonte é uma escolha de produto: 30 dias não é "todas as abertas";
 * - a assinatura do segmento inclui o escopo, para que mudança de filtro não
 *   reaproveite checkpoint antigo (regra I10).
 */
import {
  TAMANHO_PAGINA_PADRAO,
  montarQuery,
  type EndpointPNCP,
  type ParametrosConsulta,
} from "./contract";
import { FUSO_PNCP, hashEstavel } from "./mapper";

/** Mudança nesta versão invalida checkpoints de segmentos anteriores. */
export const VERSAO_PLANEJADOR = 2;
export const MODALIDADE_PREGAO_ELETRONICO = 6;
export const TAMANHO_PAGINA_PREGAO = 50;

export interface EscopoColeta {
  /** Ao menos uma UF é obrigatória; coleta nacional precisa de uma decisão explícita futura. */
  ufs: string[];
  /** Vazio significa todas as modalidades (omitidas em `/proposta`). */
  modalidades: number[];
  horizonteDias: number;
  /** Horizontes cumulativos usados para disponibilizar as urgentes primeiro. */
  etapasHorizonteDias?: number[];
  tamanhoPagina?: number;
}

export interface SegmentoColeta {
  endpoint: EndpointPNCP;
  params: ParametrosConsulta;
  assinatura: string;
  descricao: string;
  /** Menor valor é processado primeiro. */
  prioridade?: number;
}

export class EscopoInvalidoError extends Error {
  constructor(motivo: string) {
    super(`Escopo de coleta inválido: ${motivo}`);
    this.name = "EscopoInvalidoError";
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Data final do horizonte no calendário de Brasília, em AAAAMMDD.
 * Usar o calendário local evita pedir o dia errado quando em UTC já virou.
 */
export function dataFinalHorizonte(agora: Date, dias: number, zona: string = FUSO_PNCP): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const v = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? "0");

  const alvo = new Date(Date.UTC(v("year"), v("month") - 1, v("day")) + dias * 86_400_000);
  return `${alvo.getUTCFullYear()}${pad(alvo.getUTCMonth() + 1)}${pad(alvo.getUTCDate())}`;
}

const normalizarUfs = (ufs: string[]) => {
  const normalizadas = [...new Set(ufs.map((u) => u.trim().toUpperCase()).filter(Boolean))].sort();
  if (normalizadas.length === 0) {
    throw new EscopoInvalidoError(
      "informe ao menos uma UF; escopo vazio não pode iniciar uma coleta nacional",
    );
  }
  return normalizadas;
};

const PRIORIDADE_MODALIDADE: Record<number, number> = {
  6: 1,  // Pregão - Eletrônico (maior volume e relevância)
  4: 2,  // Concorrência - Eletrônica (obras e engenharia)
  8: 3,  // Dispensa
  7: 4,  // Pregão - Presencial
  12: 5, // Credenciamento
  9: 6,  // Inexigibilidade
  5: 7,  // Concorrência - Presencial
  1: 8,  // Leilão - Eletrônico
};

const normalizarModalidades = (mods: number[]) =>
  [...new Set(mods.filter((m) => Number.isInteger(m) && m > 0))].sort((a, b) => {
    const pa = PRIORIDADE_MODALIDADE[a] ?? 99;
    const pb = PRIORIDADE_MODALIDADE[b] ?? 99;
    if (pa !== pb) return pa - pb;
    return a - b;
  });

export function etapasProgressivas(horizonteDias: number): number[] {
  return [...new Set([5, 15, horizonteDias].filter((d) => d <= horizonteDias))].sort(
    (a, b) => a - b,
  );
}

/**
 * Segmentos para descobrir oportunidades com recebimento de propostas aberto.
 * Uma UF sem modalidade escolhida gera 1 segmento; com N modalidades, N segmentos.
 */
export function planejarPropostasAbertas(
  escopo: EscopoColeta,
  agora: Date = new Date(),
): SegmentoColeta[] {
  const { horizonteDias } = escopo;
  if (!Number.isInteger(horizonteDias) || horizonteDias < 1) {
    throw new EscopoInvalidoError("horizonte precisa ser um número inteiro de dias ≥ 1");
  }

  const ufs = normalizarUfs(escopo.ufs);
  const modalidades = normalizarModalidades(escopo.modalidades);
  const etapas = escopo.etapasHorizonteDias?.length
    ? [...new Set(escopo.etapasHorizonteDias.filter((d) => d > 0 && d <= horizonteDias))].sort(
        (a, b) => a - b,
      )
    : [horizonteDias];
  if (!etapas.includes(horizonteDias)) etapas.push(horizonteDias);

  // A UF é sempre explícita. `undefined` existe apenas na modalidade, onde
  // significa todas: não existe valor "0"/"todos" no contrato do PNCP.
  const dimensaoUf = ufs;
  const dimensaoModalidade: (number | undefined)[] =
    modalidades.length > 0 ? modalidades : [undefined];

  const segmentos: SegmentoColeta[] = [];
  for (const [etapaIndice, etapaDias] of etapas.entries()) {
    const dataFinal = dataFinalHorizonte(agora, etapaDias);
    for (const uf of dimensaoUf) {
      for (const modalidade of dimensaoModalidade) {
        const tamanhoPagina =
          escopo.tamanhoPagina ??
          (modalidade === MODALIDADE_PREGAO_ELETRONICO
            ? TAMANHO_PAGINA_PREGAO
            : TAMANHO_PAGINA_PADRAO);
        const params: ParametrosConsulta = {
          dataFinal,
          pagina: 1,
          tamanhoPagina,
          uf,
          ...(modalidade ? { codigoModalidadeContratacao: modalidade } : {}),
        };

        // Falha aqui, antes de qualquer rede, se o escopo produzir consulta inválida.
        montarQuery("proposta", params);

        segmentos.push({
          endpoint: "proposta",
          params,
          assinatura: hashEstavel({
            versao: VERSAO_PLANEJADOR,
            endpoint: "proposta",
            etapaDias,
            dataFinal,
            uf,
            modalidade: modalidade ?? null,
            tamanhoPagina,
          }),
          descricao: `${uf} · etapa ${etapaDias} dias · ${modalidade ? `modalidade ${modalidade}` : "todas as modalidades"} · encerramento até ${dataFinal}`,
          // Todas as modalidades da mesma etapa têm a mesma prioridade. O
          // desempate por `atualizado_em` no banco produz round-robin entre
          // elas, evitando que uma modalidade volumosa monopolize a fila.
          prioridade: etapaIndice,
        });
      }
    }
  }

  return segmentos;
}

/** Rótulo honesto do recorte, para a tela não chamar isso de "todas as abertas". */
export function descreverEscopo(escopo: EscopoColeta): string {
  const ufs = normalizarUfs(escopo.ufs);
  const mods = normalizarModalidades(escopo.modalidades);
  const onde = ufs.join(", ");
  const quais = mods.length > 0 ? `${mods.length} modalidade(s)` : "todas as modalidades";
  const etapas =
    escopo.etapasHorizonteDias && escopo.etapasHorizonteDias.length > 1
      ? ` · etapas ${escopo.etapasHorizonteDias.join("/")} dias`
      : "";
  return `${onde} · ${quais}${etapas} · propostas encerrando nos próximos ${escopo.horizonteDias} dias`;
}

/* ------------------------------------------------ incremental (Fase 3) --- */

/**
 * Data de calendário de Brasília, em AAAA-MM-DD.
 * O PNCP raciocina em datas, não em instantes (arquivo 03 §4): o incremental
 * precisa do dia local, não do dia em UTC.
 */
export function dataCalendario(agora: Date, zona: string = FUSO_PNCP): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

/** AAAA-MM-DD ± dias, em aritmética de calendário puro (sem fuso, sem DST). */
export function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split("-").map(Number);
  const t = new Date(Date.UTC(a!, m! - 1, d!) + dias * 86_400_000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** AAAA-MM-DD → AAAAMMDD, o formato que o PNCP aceita. */
export const paraDataPncp = (data: string) => data.replace(/-/g, "");

/** Cobertura já alcançada numa partição (UF × modalidade). */
export interface CoberturaParticao {
  /** "" significa nacional: é partição legítima, não ausência de valor. */
  uf: string;
  modalidadeId: number;
  /**
   * Última data de calendário INTEGRALMENTE percorrida, ou null se a partição
   * nunca foi coberta. O dia corrente nunca entra aqui enquanto está em
   * andamento — ele permanece provisório (arquivo 03 §4, item 3).
   */
  ultimaDataFechada: string | null;
}

export interface EscopoIncremental {
  ufs: string[];
  /**
   * Não pode ser vazio: `/contratacoes/atualizacao` exige modalidade, ao
   * contrário de `/proposta`. Quem chama passa o domínio ativo inteiro quando a
   * equipe não escolheu nenhuma.
   */
  modalidades: number[];
  /**
   * De onde partir numa partição sem cobertura: a data de calendário do
   * `bootstrap_started_at` da carga inicial, para que mudanças ocorridas
   * durante aquela carga continuem recuperáveis (arquivo 03 §3).
   */
  inicioPadrao: string;
  /** Reconsultar os últimos dias cobre atraso de indexação da fonte. */
  sobreposicaoDias?: number;
  /** Janelas de 1 a 7 dias, conforme arquivo 03 §4. */
  janelaDias?: number;
  tamanhoPagina?: number;
}

export const SOBREPOSICAO_PADRAO_DIAS = 2;
export const JANELA_PADRAO_DIAS = 7;

/**
 * Segmentos do ciclo incremental por atualização global.
 *
 * Diferenças que não podem se perder em relação à descoberta por propostas:
 * - modalidade é OBRIGATÓRIA aqui, então cada UF vira N segmentos, um por
 *   modalidade — o custo do ciclo cresce com o domínio, não com o catálogo;
 * - a janela é fechada (dataInicial e dataFinal), então dá para particionar o
 *   tempo em pedaços disjuntos, o que `/proposta` não permite;
 * - o dia corrente é sempre reconsultado: enquanto ele não fecha, o que a fonte
 *   devolve é provisório.
 *
 * `agora` entra por parâmetro para o teste não depender do relógio real.
 */
export function planejarIncremental(
  escopo: EscopoIncremental,
  coberturas: CoberturaParticao[],
  agora: Date = new Date(),
): SegmentoColeta[] {
  const modalidades = normalizarModalidades(escopo.modalidades);
  if (modalidades.length === 0) {
    throw new EscopoInvalidoError(
      "/contratacoes/atualizacao exige modalidade: informe ao menos uma",
    );
  }

  const sobreposicao = escopo.sobreposicaoDias ?? SOBREPOSICAO_PADRAO_DIAS;
  if (!Number.isInteger(sobreposicao) || sobreposicao < 0) {
    throw new EscopoInvalidoError("sobreposição precisa ser um número inteiro de dias ≥ 0");
  }

  const janela = escopo.janelaDias ?? JANELA_PADRAO_DIAS;
  if (!Number.isInteger(janela) || janela < 1 || janela > 7) {
    throw new EscopoInvalidoError("janela precisa ter de 1 a 7 dias (arquivo 03 §4)");
  }

  const ufs = normalizarUfs(escopo.ufs);
  const tamanhoPagina = escopo.tamanhoPagina ?? TAMANHO_PAGINA_PADRAO;
  const hoje = dataCalendario(agora);

  // Índice das coberturas por partição, para não varrer a lista por segmento.
  const porParticao = new Map(
    coberturas.map((c) => [`${c.uf}|${c.modalidadeId}`, c.ultimaDataFechada]),
  );

  const dimensaoUf = ufs;
  const segmentos: SegmentoColeta[] = [];

  for (const uf of dimensaoUf) {
    for (const modalidade of modalidades) {
      const fechada = porParticao.get(`${uf}|${modalidade}`) ?? null;

      // Sem cobertura, parte do bootstrap; com cobertura, do dia seguinte ao
      // último fechado — e a sobreposição recua a fronteira, para recuperar o
      // que a fonte indexou tarde.
      const bruto = fechada ? somarDias(fechada, 1) : escopo.inicioPadrao;
      let inicio = somarDias(bruto, -sobreposicao);

      // Uma partição nunca precisa de janela que comece depois de hoje.
      if (inicio > hoje) inicio = hoje;

      for (let de = inicio; de <= hoje; de = somarDias(de, janela)) {
        const ate = somarDias(de, janela - 1) > hoje ? hoje : somarDias(de, janela - 1);

        const params: ParametrosConsulta = {
          dataInicial: paraDataPncp(de),
          dataFinal: paraDataPncp(ate),
          codigoModalidadeContratacao: modalidade,
          pagina: 1,
          tamanhoPagina,
          uf,
        };

        // Falha aqui, antes de qualquer rede, se o escopo produzir consulta inválida.
        montarQuery("atualizacao", params);

        segmentos.push({
          endpoint: "atualizacao",
          params,
          assinatura: hashEstavel({
            versao: VERSAO_PLANEJADOR,
            endpoint: "atualizacao",
            uf,
            modalidade,
            de,
            ate,
            tamanhoPagina,
          }),
          descricao: `${uf} · modalidade ${modalidade} · atualizadas de ${de} a ${ate}`,
        });
      }
    }
  }

  return segmentos;
}

/**
 * Até onde a cobertura de uma janela percorrida pode avançar.
 *
 * O dia corrente NUNCA fecha: enquanto ele está em andamento, a fonte ainda vai
 * receber atualizações com essa data (arquivo 03 §4). Então uma janela que
 * termina no passado fecha inteira; uma que alcança hoje fecha só até ontem; e
 * uma que cobre apenas hoje não fecha dia nenhum — daí o null, que impede
 * declarar coberto um dia que esta janela não consultou.
 */
export function ultimaDataFechavel(
  dataInicialJanela: string,
  dataFinalJanela: string,
  hoje: string,
): string | null {
  if (dataFinalJanela < hoje) return dataFinalJanela;
  const ontem = somarDias(hoje, -1);
  if (dataInicialJanela > ontem) return null;
  return ontem;
}

/** Rótulo honesto do ciclo incremental, para a tela não prometer "tudo atualizado". */
export function descreverIncremental(escopo: EscopoIncremental, segmentos: number): string {
  const ufs = normalizarUfs(escopo.ufs);
  const onde = ufs.join(", ");
  const mods = normalizarModalidades(escopo.modalidades).length;
  return `${onde} · ${mods} modalidade(s) · ${segmentos} janela(s) de atualização`;
}
