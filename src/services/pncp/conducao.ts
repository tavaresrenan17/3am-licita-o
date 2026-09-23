/**
 * O QUE FAZER DEPOIS DE CADA TICK.
 *
 * Usado pelos dois condutores — a linha de comando agendada e a tela de
 * sincronização — para que ambos tratem espera e falha do mesmo jeito.
 *
 * A distinção que importa: tick que tentou o PNCP e não gravou nada é falha e
 * conta para o limite; tick que nem chamou o PNCP porque todo segmento está em
 * cooldown é só espera. Antes, os dois contavam igual e o condutor desistia em
 * ~25 s enquanto o segmento aguardava 13 min — medido em 23/09/2026 às 09:30,
 * quando a próxima chance ficou para 3 h depois.
 */

/** O pedaço do resumo do tick que a decisão lê. */
export interface ResumoParaConducao {
  jobConcluido: boolean;
  paginasAplicadas: number;
  aguardandoCooldown: boolean;
  proximaTentativaEmMs: number | null;
  erros: string[];
  metricasApi: { requisicoes: number; falhasConsecutivas: number };
}

export interface OpcoesConducao {
  /** Ticks seguidos que chamaram o PNCP sem gravar nenhuma página. */
  falhasSeguidas: number;
  limiteFalhas: number;
  /** Quanto resta da janela de execução; Infinity quando não há teto. */
  restanteJanelaMs: number;
}

export type DecisaoConducao =
  | { acao: "concluir" }
  | { acao: "seguir"; esperaMs: number; falhasSeguidas: number }
  | { acao: "pausar"; motivo: string };

/**
 * Ticks falhos seguidos até um condutor SEM janela de tempo desistir (execução
 * manual e tela). Com o cooldown de 15 s, 30 s e depois 1 min, e cada sonda
 * limitada a uma tentativa de até 25 s, doze tentativas cobrem uns 15 min de
 * fonte fora. Com janela do agendador, quem limita é a janela.
 */
export const LIMITE_TICKS_FALHOS_SEM_JANELA = 12;

/**
 * Se a última chamada ao PNCP falhou, o próximo tick começa em modo sonda.
 * Tick que não chamou o PNCP (só esperou cooldown) não traz notícia da fonte e
 * mantém o que já se sabia.
 */
export function fonteSegueInstavel(resumo: ResumoParaConducao, anterior: boolean): boolean {
  if (resumo.metricasApi.requisicoes === 0) return anterior;
  return resumo.metricasApi.falhasConsecutivas > 0;
}

/** Espera quando não há previsão de cooldown, e margem sobre a previsão. */
const ESPERA_CURTA_MS = 5_000;
const MARGEM_COOLDOWN_MS = 1_000;

export function decidirProximoTick(
  resumo: ResumoParaConducao,
  { falhasSeguidas, limiteFalhas, restanteJanelaMs }: OpcoesConducao,
): DecisaoConducao {
  if (resumo.jobConcluido) return { acao: "concluir" };
  if (resumo.paginasAplicadas > 0) return { acao: "seguir", esperaMs: 0, falhasSeguidas: 0 };

  const tentouFonte = resumo.metricasApi.requisicoes > 0;
  const falhas = tentouFonte ? falhasSeguidas + 1 : falhasSeguidas;
  if (falhas >= limiteFalhas) {
    return {
      acao: "pausar",
      motivo: `Fonte instável após ${falhas} tentativas seguidas: ${resumo.erros[0] ?? "falha na coleta"}`,
    };
  }

  const esperaMs =
    resumo.proximaTentativaEmMs !== null && resumo.proximaTentativaEmMs > 0
      ? resumo.proximaTentativaEmMs + MARGEM_COOLDOWN_MS
      : ESPERA_CURTA_MS;
  if (esperaMs >= restanteJanelaMs) {
    return {
      acao: "pausar",
      motivo: "Próxima tentativa só depois do fim desta janela; a execução seguinte retoma daqui",
    };
  }

  return { acao: "seguir", esperaMs, falhasSeguidas: falhas };
}
