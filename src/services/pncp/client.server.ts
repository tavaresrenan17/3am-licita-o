/**
 * CLIENTE HTTP DA API DE CONSULTA DO PNCP.
 *
 * Regras de resiliência da especificação (arquivos 01 §5 e 03 §8):
 * - 204 é tratado ANTES de tentar ler JSON;
 * - corpo HTML ou envelope incoerente não é lote válido;
 * - 400/422 é falha de contrato: não repetir a mesma requisição;
 * - 429 respeita Retry-After (segundos ou data HTTP);
 * - transitórios usam backoff exponencial com jitter e orçamento finito.
 *
 * Nenhum número aqui é quota oficial do PNCP: são limites da nossa aplicação.
 */
import { montarUrl, type EndpointPNCP, type ParametrosConsulta } from "./contract";
import { urlArquivos, type ArquivoPNCP } from "./documentos";
import type { ContratacaoPNCP } from "./mapper";

export interface EnvelopePNCP {
  data: ContratacaoPNCP[];
  totalRegistros?: number;
  totalPaginas?: number;
  numeroPagina?: number;
  paginasRestantes?: number;
  empty?: boolean;
}

export interface ResultadoPagina {
  /** 200 com corpo, ou 204 sem conteúdo. */
  status: 200 | 204;
  envelope: EnvelopePNCP | null;
  url: string;
  tentativas: number;
  duracaoMs: number;
  falhas?: FalhasTentativasPNCP;
}

export interface FalhasTentativasPNCP {
  timeouts: number;
  erros429: number;
  erros5xx: number;
  outras: number;
}

const falhasVazias = (): FalhasTentativasPNCP => ({
  timeouts: 0,
  erros429: 0,
  erros5xx: 0,
  outras: 0,
});

/** Requisição inválida segundo a fonte (400/422): corrigir, não repetir. */
export class ErroContratoPNCP extends Error {
  constructor(
    readonly status: number,
    readonly detalhe: string,
  ) {
    super(`PNCP recusou a consulta (HTTP ${status}): ${detalhe}`);
    this.name = "ErroContratoPNCP";
  }
}

/**
 * A fonte não conhece o recurso (404). Medido em 14/09/2026 na base de
 * Integração: `{"status":"404","message":"Compra não encontrada. <cnpj>"}`.
 * É definitivo como o 400 — repetir a mesma URL não muda a resposta —, mas é
 * uma condição do dado, não um erro de requisição, e merece mensagem própria.
 */
export class RecursoInexistentePNCP extends Error {
  constructor(readonly detalhe: string) {
    super(`PNCP não encontrou o recurso: ${detalhe}`);
    this.name = "RecursoInexistentePNCP";
  }
}

/** Corpo inesperado: HTML de proxy, JSON quebrado ou metadados contraditórios. */
export class RespostaInvalidaPNCP extends Error {
  constructor(motivo: string) {
    super(`Resposta inválida do PNCP: ${motivo}`);
    this.name = "RespostaInvalidaPNCP";
  }
}

/** Falha transitória que esgotou tentativas ou orçamento de tempo. */
export class FalhaTransitoriaPNCP extends Error {
  constructor(
    motivo: string,
    readonly status: number | null,
    readonly tentativas: number,
    readonly falhas: FalhasTentativasPNCP = falhasVazias(),
    readonly duracaoMs = 0,
  ) {
    super(`Falha transitória no PNCP após ${tentativas} tentativa(s): ${motivo}`);
    this.name = "FalhaTransitoriaPNCP";
  }
}

export interface OpcoesCliente {
  fetchImpl?: typeof fetch;
  dormir?: (ms: number) => Promise<void>;
  aleatorio?: () => number;
  agora?: () => number;
  /** Timeout de uma requisição. A primeira página medida levou 19,6 s. */
  timeoutMs?: number;
  tentativasMax?: number;
  esperaMaxMs?: number;
  /** Tempo total disponível para esta página (orçamento do tick). */
  orcamentoMs?: number;
}

const PADROES = {
  // Ajustado para 25s: compatível com os limites de timeout do runtime serverless/edge
  // (Cloudflare Nitro). Evita que o host encerre a função antes de o cliente tratar
  // timeouts e liberar recursos no banco.
  timeoutMs: 25_000,
  // Três tentativas preservam tolerância a falha passageira e devolvem o
  // segmento à fila cedo para que as outras modalidades possam avançar.
  tentativasMax: 3,
  esperaMaxMs: 30_000,
  orcamentoMs: Number.POSITIVE_INFINITY,
};

const dormirPadrao = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Retry-After em segundos ou data HTTP → espera em ms (nulo quando ausente/ilegível). */
export function esperaDoRetryAfter(valor: string | null, agoraMs: number): number | null {
  if (!valor) return null;
  const texto = valor.trim();
  if (/^\d+$/.test(texto)) return Number(texto) * 1000;
  const data = Date.parse(texto);
  if (Number.isNaN(data)) return null;
  return Math.max(0, data - agoraMs);
}

function validarEnvelope(corpo: unknown, paginaPedida: number): EnvelopePNCP {
  if (typeof corpo !== "object" || corpo === null || Array.isArray(corpo)) {
    throw new RespostaInvalidaPNCP("corpo não é um objeto de envelope");
  }
  const env = corpo as EnvelopePNCP;
  if (!Array.isArray(env.data)) {
    throw new RespostaInvalidaPNCP('campo "data" ausente ou não é lista');
  }
  if (typeof env.numeroPagina === "number" && env.numeroPagina !== paginaPedida) {
    throw new RespostaInvalidaPNCP(
      `página ${env.numeroPagina} recebida quando ${paginaPedida} foi pedida`,
    );
  }
  return env;
}

interface ResultadoJson<T> {
  status: 200 | 204;
  corpo: T | null;
  url: string;
  tentativas: number;
  duracaoMs: number;
  falhas: FalhasTentativasPNCP;
}

/**
 * Motor de requisição: uma única implementação das regras de resiliência acima,
 * usada tanto pela listagem de contratações quanto pelos metadados de
 * documentos. O que muda entre as rotas é a URL e o formato do corpo — a
 * listagem devolve envelope `{data}`, `/arquivos` devolve array puro —, então a
 * validação entra por fora em vez de duplicar backoff, 204 e Retry-After.
 */
async function requisitarJson<T>(
  url: string,
  opcoes: OpcoesCliente,
  validar: (corpo: unknown) => T,
): Promise<ResultadoJson<T>> {
  const {
    fetchImpl = fetch,
    dormir = dormirPadrao,
    aleatorio = Math.random,
    agora = Date.now,
    timeoutMs = PADROES.timeoutMs,
    tentativasMax = PADROES.tentativasMax,
    esperaMaxMs = PADROES.esperaMaxMs,
    orcamentoMs = PADROES.orcamentoMs,
  } = opcoes;

  const inicio = agora();
  const restante = () => orcamentoMs - (agora() - inicio);

  let ultimoMotivo = "desconhecido";
  let ultimoStatus: number | null = null;
  const falhas = falhasVazias();

  for (let tentativa = 1; tentativa <= tentativasMax; tentativa++) {
    const controlador = new AbortController();
    const timer = setTimeout(() => controlador.abort(), timeoutMs);

    try {
      const resposta = await fetchImpl(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controlador.signal,
      });

      // 204 primeiro: ler JSON de corpo vazio geraria erro de parsing.
      if (resposta.status === 204) {
        return {
          status: 204,
          corpo: null,
          url,
          tentativas: tentativa,
          duracaoMs: agora() - inicio,
          falhas: { ...falhas },
        };
      }

      if (resposta.status === 400 || resposta.status === 422) {
        const detalhe = (await resposta.text().catch(() => "")).slice(0, 500);
        throw new ErroContratoPNCP(resposta.status, detalhe || resposta.statusText);
      }

      if (resposta.status === 401 || resposta.status === 403) {
        // Leitura pública não deveria exigir credencial: registrar e não contornar.
        const detalhe = (await resposta.text().catch(() => "")).slice(0, 500);
        throw new ErroContratoPNCP(resposta.status, detalhe || resposta.statusText);
      }

      // 404 é resposta legítima da base de Integração para compra que ela não
      // conhece ("Compra não encontrada", medido em 14/09/2026). Repetir não
      // muda o resultado, e tratar como transitório prenderia a fila.
      if (resposta.status === 404) {
        const detalhe = (await resposta.text().catch(() => "")).slice(0, 300);
        throw new RecursoInexistentePNCP(detalhe || resposta.statusText);
      }

      if (resposta.status === 429 || resposta.status >= 500) {
        if (resposta.status === 429) falhas.erros429++;
        else falhas.erros5xx++;
        ultimoStatus = resposta.status;
        const textoErro = (await resposta.text().catch(() => "")).slice(0, 300);
        const ehSaturacaoDb =
          textoErro.includes("HikariPool") ||
          textoErro.includes("banco de dados") ||
          resposta.status === 504;

        ultimoMotivo = ehSaturacaoDb
          ? `PNCP saturado: ${textoErro || `HTTP ${resposta.status}`}`
          : `HTTP ${resposta.status}${textoErro ? `: ${textoErro}` : ""}`;

        const retryAfter =
          resposta.status === 429
            ? esperaDoRetryAfter(resposta.headers.get("retry-after"), agora())
            : null;
        const teto = Math.min(esperaMaxMs, 1000 * 2 ** (tentativa - 1));

        // Se o pool de conexões do PNCP estiver esgotado ("Erro na comunicação com o banco de dados"),
        // esperar pelo menos 3 segundos antes de nova tentativa para evitar amplificar a queda.
        const piso = ehSaturacaoDb ? 3_000 : Math.round(teto / 2);
        const espera = retryAfter ?? (piso + Math.round(aleatorio() * (teto / 2)));

        if (tentativa === tentativasMax) break;
        if (espera >= restante()) {
          throw new FalhaTransitoriaPNCP(
            `espera de ${espera} ms excede o orçamento restante (${ultimoMotivo})`,
            ultimoStatus,
            tentativa,
            { ...falhas },
            agora() - inicio,
          );
        }
        await dormir(espera);
        continue;
      }

      if (!resposta.ok) {
        throw new RespostaInvalidaPNCP(`status inesperado ${resposta.status}`);
      }

      const tipo = resposta.headers.get("content-type") ?? "";
      if (!tipo.includes("json")) {
        const amostra = (await resposta.text().catch(() => "")).slice(0, 120);
        throw new RespostaInvalidaPNCP(
          `content-type "${tipo || "ausente"}" não é JSON (amostra: ${amostra})`,
        );
      }

      let corpo: unknown;
      try {
        corpo = await resposta.json();
      } catch {
        throw new RespostaInvalidaPNCP("JSON malformado");
      }

      return {
        status: 200,
        corpo: validar(corpo),
        url,
        tentativas: tentativa,
        duracaoMs: agora() - inicio,
        falhas: { ...falhas },
      };
    } catch (erro) {
      if (
        erro instanceof ErroContratoPNCP ||
        erro instanceof RecursoInexistentePNCP ||
        erro instanceof RespostaInvalidaPNCP ||
        erro instanceof FalhaTransitoriaPNCP
      ) {
        throw erro;
      }

      // Timeout, reset de conexão e DNS entram aqui.
      ultimoMotivo = erro instanceof Error ? erro.message : String(erro);
      ultimoStatus = null;
      const nome = erro instanceof Error ? erro.name.toLowerCase() : "";
      const mensagem = ultimoMotivo.toLowerCase();
      if (nome.includes("abort") || nome.includes("timeout") || mensagem.includes("timeout")) {
        falhas.timeouts++;
      } else {
        falhas.outras++;
      }
      if (tentativa === tentativasMax) break;

      const teto = Math.min(esperaMaxMs, 1000 * 2 ** (tentativa - 1));
      const espera = Math.round(aleatorio() * teto);
      if (espera >= restante()) {
        throw new FalhaTransitoriaPNCP(
          `${ultimoMotivo}; espera excede o orçamento restante`,
          ultimoStatus,
          tentativa,
          { ...falhas },
          agora() - inicio,
        );
      }
      await dormir(espera);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new FalhaTransitoriaPNCP(
    ultimoMotivo,
    ultimoStatus,
    tentativasMax,
    { ...falhas },
    agora() - inicio,
  );
}

/**
 * Busca uma página de uma listagem de contratações, com validação de contrato
 * antes da rede e tratamento explícito de 204, corpo inválido e falhas.
 */
export async function buscarPagina(
  endpoint: EndpointPNCP,
  params: ParametrosConsulta,
  opcoes: OpcoesCliente = {},
): Promise<ResultadoPagina> {
  // Valida e monta a URL: parâmetro fora do contrato falha aqui, sem gastar rede.
  const url = montarUrl(endpoint, params);
  const r = await requisitarJson(url, opcoes, (corpo) => validarEnvelope(corpo, params.pagina));
  return {
    status: r.status,
    envelope: r.corpo,
    url: r.url,
    tentativas: r.tentativas,
    duracaoMs: r.duracaoMs,
    falhas: r.falhas,
  };
}

export interface ResultadoArquivos {
  status: 200 | 204;
  arquivos: ArquivoPNCP[];
  url: string;
  tentativas: number;
  duracaoMs: number;
}

/**
 * `/arquivos` devolve um ARRAY puro, não o envelope `{data,totalRegistros}` das
 * listagens (verificado em 14/09/2026). Um objeto aqui significa que a rota
 * mudou ou que um proxy respondeu no lugar dela — nos dois casos é melhor
 * falhar visivelmente do que gravar documento nenhum e chamar de "completo".
 */
function validarListaArquivos(corpo: unknown): ArquivoPNCP[] {
  if (!Array.isArray(corpo)) {
    throw new RespostaInvalidaPNCP(
      `esperado array de documentos, recebido ${corpo === null ? "null" : typeof corpo}`,
    );
  }
  for (const item of corpo) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new RespostaInvalidaPNCP("lista de documentos com item que não é objeto");
    }
  }
  return corpo as ArquivoPNCP[];
}

/**
 * Metadados dos documentos de uma contratação, na base de Integração.
 *
 * Lista vazia é resposta legítima: significa contratação sem documento
 * publicado, e não "ainda não coletado" (arquivo 08 §4). Quem chama precisa
 * manter essa distinção ao gravar o estado da coleta.
 */
export async function buscarArquivos(
  cnpj: string,
  ano: number,
  sequencial: number,
  opcoes: OpcoesCliente = {},
): Promise<ResultadoArquivos> {
  const url = urlArquivos(cnpj, ano, sequencial);
  const r = await requisitarJson(url, opcoes, validarListaArquivos);
  return {
    status: r.status,
    arquivos: r.corpo ?? [],
    url: r.url,
    tentativas: r.tentativas,
    duracaoMs: r.duracaoMs,
  };
}
