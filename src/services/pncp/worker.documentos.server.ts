/**
 * WORKER DA FILA DE DOCUMENTOS (Fase 4).
 *
 * Fila própria, separada da coleta de cabeçalhos (arquivo 08 §4): descobrir
 * oportunidades não pode ficar preso ao enriquecimento, e o enriquecimento não
 * pode reabrir um job de sincronização já encerrado.
 *
 * Invariantes herdadas do worker de ingestão:
 * - a rede acontece FORA da transação; o commit é a RPC `pncp_gravar_documentos`;
 * - falha antes do commit não marca a licitação como coletada;
 * - 404/400 é definitivo: a licitação sai da fila e só volta depois do prazo;
 * - falha transitória encerra o tick e devolve o que sobrou para a fila;
 * - uma licitação problemática não derruba o lote inteiro.
 *
 * Pressão sobre a fonte: o arquivo 03 §8 fixa 2 requisições simultâneas e no
 * máximo 2 partidas por segundo para toda a integração — limite da nossa
 * aplicação, não quota publicada pelo PNCP. Como o worker de cabeçalhos é
 * sequencial e não roda junto com este, a cota inteira fica aqui.
 */
import { calcularScore } from "@/lib/score";
import {
  buscarArquivos,
  ErroContratoPNCP,
  RecursoInexistentePNCP,
  RespostaInvalidaPNCP,
} from "./client.server";
import { ArquivoInvalidoError, mapearArquivos, type DocumentoRow } from "./documentos";
import type { ConfigScore } from "./mapper";

/** Uma licitação reservada para coleta, com o que o score precisa. */
export interface LicitacaoParaDocumentos {
  licitacaoId: string;
  cnpj: string;
  ano: number;
  sequencial: number;
  objeto: string;
  modalidadeNome: string | null;
  categoria: string;
  valorEstimado: number | null;
}

export interface ResultadoGravacao {
  gravados: number;
  removidos: number;
  ativos: number;
}

/** Porta de persistência: implementada pelo Supabase, trocável nos testes. */
export interface PortaDocumentos {
  /** Entrega até `limite` licitações JÁ marcadas como 'coletando'. */
  reservar(limite: number): Promise<LicitacaoParaDocumentos[]>;
  gravar(
    licitacaoId: string,
    documentos: DocumentoRow[],
    score: number,
  ): Promise<ResultadoGravacao>;
  registrarFalha(licitacaoId: string, motivo: string, definitiva: boolean): Promise<void>;
  /** Devolve à fila o que foi reservado e não deu tempo de coletar. */
  liberar(licitacaoIds: string[]): Promise<void>;
}

export interface OpcoesTickDocumentos {
  banco: PortaDocumentos;
  cfg: ConfigScore;
  buscar?: typeof buscarArquivos;
  agora?: () => number;
  dormir?: (ms: number) => Promise<void>;
  /** Orçamento do tick; o padrão deixa folga sob o limite do runtime. */
  orcamentoMs?: number;
  /** Tempo mínimo que precisa sobrar para começar mais uma licitação. */
  reservaMs?: number;
  loteReserva?: number;
  maxLicitacoesPorTick?: number;
  concorrencia?: number;
  intervaloPartidaMs?: number;
}

export interface ResumoTickDocumentos {
  licitacoesProcessadas: number;
  documentosGravados: number;
  documentosRemovidos: number;
  /** Contratações que a fonte respondeu sem nenhum documento publicado. */
  semDocumentos: number;
  /** true quando a reserva veio vazia: não há mais nada pendente. */
  filaVazia: boolean;
  erros: string[];
  duracaoMs: number;
}

const PADRAO = {
  // A rota respondeu em 45–103 ms na sondagem de 14/09/2026, então o gargalo é
  // o limitador de partidas, não a latência: em 60 s cabem ~110 licitações.
  orcamentoMs: 60_000,
  reservaMs: 5_000,
  loteReserva: 25,
  maxLicitacoesPorTick: 200,
  concorrencia: 2,
  // 2 partidas por segundo (arquivo 03 §8).
  intervaloPartidaMs: 500,
};

const dormirPadrao = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Erro que não melhora se repetirmos a mesma URL: a fonte não tem o recurso, ou
 * recusou o contrato, ou devolveu algo que não é a lista prometida. A licitação
 * sai da fila e só volta depois do prazo de reprocessamento.
 */
function ehDefinitiva(erro: unknown): boolean {
  return (
    erro instanceof RecursoInexistentePNCP ||
    erro instanceof ErroContratoPNCP ||
    erro instanceof RespostaInvalidaPNCP ||
    erro instanceof ArquivoInvalidoError
  );
}

/**
 * Executa um tick da fila de documentos.
 * Não lança por falha de rede: devolve o resumo com os erros observados, para
 * que a tela mostre progresso parcial em vez de perder o que já foi gravado.
 */
export async function executarTickDocumentos(
  opcoes: OpcoesTickDocumentos,
): Promise<ResumoTickDocumentos> {
  const {
    banco,
    cfg,
    buscar = buscarArquivos,
    agora = Date.now,
    dormir = dormirPadrao,
    orcamentoMs = PADRAO.orcamentoMs,
    reservaMs = PADRAO.reservaMs,
    loteReserva = PADRAO.loteReserva,
    maxLicitacoesPorTick = PADRAO.maxLicitacoesPorTick,
    concorrencia = PADRAO.concorrencia,
    intervaloPartidaMs = PADRAO.intervaloPartidaMs,
  } = opcoes;

  const inicio = agora();
  const restante = () => orcamentoMs - (agora() - inicio);

  const resumo: ResumoTickDocumentos = {
    licitacoesProcessadas: 0,
    documentosGravados: 0,
    documentosRemovidos: 0,
    semDocumentos: 0,
    filaVazia: false,
    erros: [],
    duracaoMs: 0,
  };

  // Compartilhado por todas as tarefas do tick: é o limite global de partidas,
  // não um limite por tarefa. Dez tarefas com "2 cada" não atendem a 2 global.
  let proximaPartida = inicio;
  let pararTick = false;

  /**
   * O que foi reservado e ainda não teve desfecho no banco. Contar por índice
   * não serve: uma tarefa pode pegar o índice e desistir por orçamento, e a
   * licitação ficaria presa em 'coletando' sem ninguém para liberá-la.
   */
  let pendentes = new Set<string>();

  const coletar = async (alvo: LicitacaoParaDocumentos): Promise<void> => {
    try {
      const resposta = await buscar(alvo.cnpj, alvo.ano, alvo.sequencial, {
        orcamentoMs: Math.max(restante(), 1),
      });

      const { linhas, rejeitados } = mapearArquivos(alvo.licitacaoId, resposta.arquivos);
      if (rejeitados.length > 0) {
        resumo.erros.push(...rejeitados.map((r) => `${alvo.licitacaoId}: ${r}`));
      }

      // Documento retirado da fonte não conta como material disponível para a
      // equipe, então também não pode somar pontos de aderência.
      const score = calcularScore(
        {
          objeto: alvo.objeto,
          modalidade: alvo.modalidadeNome ?? "",
          valor_estimado: alvo.valorEstimado,
          categoria: alvo.categoria,
          documentos: linhas.filter((l) => l.ativo),
        },
        cfg,
      );

      const gravacao = await banco.gravar(alvo.licitacaoId, linhas, score);
      pendentes.delete(alvo.licitacaoId);

      resumo.licitacoesProcessadas++;
      resumo.documentosGravados += gravacao.gravados;
      resumo.documentosRemovidos += gravacao.removidos;
      // Lista vazia é resposta legítima — "sem documento publicado", que é
      // diferente de "ainda não coletado". A contagem separa as duas na tela.
      if (linhas.length === 0) resumo.semDocumentos++;
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      const definitiva = ehDefinitiva(erro);

      await banco.registrarFalha(alvo.licitacaoId, motivo, definitiva);
      // A falha já deixou a licitação em 'erro' ou de volta em 'pendente': ela
      // não pode entrar também na liberação em lote.
      pendentes.delete(alvo.licitacaoId);
      resumo.erros.push(`${alvo.licitacaoId}: ${motivo}`);

      // Transitório é sinal de fonte degradada, não de dado ruim: insistir nas
      // próximas licitações só aumentaria a pressão sobre um serviço instável.
      if (!definitiva) pararTick = true;
    }
  };

  /** Processa o lote com concorrência e partidas limitadas; devolve o que sobrou. */
  const processarLote = async (lote: LicitacaoParaDocumentos[]): Promise<string[]> => {
    pendentes = new Set(lote.map((l) => l.licitacaoId));
    let proximo = 0;

    const tarefa = async (): Promise<void> => {
      while (!pararTick) {
        if (proximo >= lote.length) return;
        if (restante() <= reservaMs) return;

        const espera = proximaPartida - agora();
        if (espera > 0 && espera >= restante()) return;

        // Índice e vaga de partida saem juntos, sem await entre os dois: é o
        // que impede duas tarefas de pegarem a mesma licitação ou de furarem
        // o limite global de partidas por segundo.
        const indice = proximo++;
        proximaPartida = Math.max(proximaPartida, agora()) + intervaloPartidaMs;

        if (espera > 0) await dormir(espera);

        await coletar(lote[indice]!);
      }
    };

    await Promise.all(
      Array.from({ length: Math.max(1, Math.min(concorrencia, lote.length)) }, tarefa),
    );

    return [...pendentes];
  };

  while (!pararTick && resumo.licitacoesProcessadas < maxLicitacoesPorTick) {
    if (restante() <= reservaMs) break;

    const espaco = maxLicitacoesPorTick - resumo.licitacoesProcessadas;
    const lote = await banco.reservar(Math.min(loteReserva, espaco));

    if (lote.length === 0) {
      resumo.filaVazia = true;
      break;
    }

    const sobraram = await processarLote(lote);
    if (sobraram.length > 0) {
      // Sem isto, o que foi reservado e não coletado ficaria em 'coletando' até
      // a reserva expirar — a fila pareceria travada por 15 minutos.
      await banco.liberar(sobraram);
      break;
    }
  }

  resumo.duracaoMs = agora() - inicio;
  return resumo;
}
