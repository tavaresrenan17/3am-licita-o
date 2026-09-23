/**
 * SONDA AO VIVO DA API DO PNCP.
 *
 * As métricas em `sincronizacoes.api_*` dizem como a fonte se comportou na
 * última coleta; esta sonda diz se ela responde AGORA. Uma requisição por
 * serviço, sem retentativa: repetir mascararia justamente a queda que se quer ver.
 *
 * Consulta e Integração são serviços distintos e caem separados — em 23/09/2026
 * a listagem ficou 60 s sem responder enquanto `/modalidades` respondia em 130 ms.
 *
 * Calibragem (medida em 15/09/2026): por UF a listagem responde em 0,7–1,5 s
 * com a fonte saudável; 5xx é o sinal de saturação do PNCP, não o 429.
 */
import type { EstadoApiPncp, SondaApiPncpDTO, StatusApiPncpDTO } from "@/lib/dto";
import { montarUrl } from "./contract";
import { PNCP_INTEGRACAO_BASE } from "./documentos";

/** Acima disto a fonte responde, mas lenta demais para uma coleta confortável. */
export const LIMITE_LENTA_MS = 5_000;

/** Abaixo dos 25 s do runtime serverless, para a sonda sempre conseguir responder. */
const TIMEOUT_PADRAO_MS = 15_000;

interface Observacao {
  httpStatus: number | null;
  latenciaMs: number;
  corpoValido?: boolean;
  erro?: "timeout" | "rede";
  mensagemErro?: string;
}

export function classificarSonda(o: Observacao): { estado: EstadoApiPncp; detalhe: string } {
  if (o.erro === "timeout") {
    return {
      estado: "fora_do_ar",
      detalhe: `Sem resposta em ${Math.round(o.latenciaMs / 1000)} s`,
    };
  }
  if (o.erro === "rede") {
    return { estado: "fora_do_ar", detalhe: `Falha de rede: ${o.mensagemErro ?? "desconhecida"}` };
  }
  const status = o.httpStatus ?? 0;
  if (status >= 500) {
    return { estado: "fora_do_ar", detalhe: `Erro no servidor do PNCP (HTTP ${status})` };
  }
  if (status === 429) {
    return { estado: "instavel", detalhe: "Limitando requisições (HTTP 429)" };
  }
  if (status !== 200 && status !== 204) {
    return { estado: "instavel", detalhe: `Resposta inesperada (HTTP ${status})` };
  }
  if (!o.corpoValido) {
    return { estado: "fora_do_ar", detalhe: "Respondeu, mas o conteúdo não é o da API" };
  }
  if (o.latenciaMs > LIMITE_LENTA_MS) {
    return { estado: "lenta", detalhe: "Respondendo, mas acima do normal" };
  }
  return { estado: "online", detalhe: "Respondendo normalmente" };
}

export interface OpcoesSonda {
  fetchImpl?: typeof fetch;
  agora?: () => number;
  timeoutMs?: number;
}

export async function sondar(
  url: string,
  validar: (corpo: unknown) => boolean,
  opcoes: OpcoesSonda = {},
): Promise<SondaApiPncpDTO> {
  const fetchImpl = opcoes.fetchImpl ?? fetch;
  const agora = opcoes.agora ?? Date.now;
  const timeoutMs = opcoes.timeoutMs ?? TIMEOUT_PADRAO_MS;

  const controle = new AbortController();
  const prazo = setTimeout(() => controle.abort(), timeoutMs);
  const inicio = agora();
  let obs: Observacao;

  try {
    const r = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: controle.signal,
    });
    // 204 antes de ler JSON, como no cliente da coleta.
    let corpoValido = r.status === 204;
    if (r.status === 200) {
      const texto = await r.text();
      try {
        corpoValido = validar(JSON.parse(texto));
      } catch {
        corpoValido = false;
      }
    }
    obs = { httpStatus: r.status, latenciaMs: agora() - inicio, corpoValido };
  } catch (e) {
    const latenciaMs = agora() - inicio;
    obs = controle.signal.aborted
      ? { httpStatus: null, latenciaMs: Math.max(latenciaMs, timeoutMs), erro: "timeout" }
      : {
          httpStatus: null,
          latenciaMs,
          erro: "rede",
          mensagemErro: e instanceof Error ? e.message : String(e),
        };
  } finally {
    clearTimeout(prazo);
  }

  return {
    ...classificarSonda(obs),
    httpStatus: obs.httpStatus,
    latenciaMs: Math.round(obs.latenciaMs),
  };
}

/** AC é das UFs com menos contratações abertas: a página mínima volta rápido. */
export function urlSondaConsulta(hoje: Date = new Date()): string {
  const dataFinal = new Date(hoje.getTime() + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");
  return montarUrl("proposta", { dataFinal, uf: "AC", pagina: 1, tamanhoPagina: 10 });
}

const envelopeListagem = (c: unknown) =>
  typeof c === "object" && c !== null && Array.isArray((c as { data?: unknown }).data);

export async function verificarStatusPncp(opcoes: OpcoesSonda = {}): Promise<StatusApiPncpDTO> {
  const [consulta, integracao] = await Promise.all([
    sondar(urlSondaConsulta(), envelopeListagem, opcoes),
    sondar(`${PNCP_INTEGRACAO_BASE}/modalidades`, Array.isArray, opcoes),
  ]);
  return { consulta, integracao, verificadoEm: new Date().toISOString() };
}
