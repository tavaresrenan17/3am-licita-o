/**
 * HOOKS DE DADOS DAS TELAS.
 *
 * Tudo vem do banco por server functions: nenhuma tela conversa com o PNCP, e
 * nenhum filtro roda sobre um pedaço da tabela baixado no navegador.
 */
import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CoberturaDocumentosDTO,
  CoberturaIncrementalDTO,
  DetalheDTO,
  MetricasDTO,
  PatchConfiguracoesDTO,
  ProgressoSyncDTO,
  ResultadoBuscaDTO,
  ResumoColetaDocumentosDTO,
  SincronizacaoDTO,
} from "@/lib/dto";
import type { FiltrosLicitacoes, OrdenacaoCampo, StatusInterno } from "@/lib/types";
import {
  atualizarInternoFn,
  buscarLicitacoesFn,
  coberturaDocumentosFn,
  coberturaIncrementalFn,
  executarTickDocumentosFn,
  executarTickFn,
  iniciarIncrementalFn,
  iniciarSincronizacaoFn,
  interromperSincronizacaoFn,
  listarModalidadesFn,
  listarSincronizacoesFn,
  metricasFn,
  obterConfiguracoesFn,
  obterLicitacaoFn,
  opcoesFiltrosFn,
  salvarConfiguracoesFn,
  statusSincronizacaoFn,
} from "@/services/licitacoes.functions";

/** Campos de ordenação da UI → colunas do banco. */
const COLUNA_ORDENACAO: Record<
  OrdenacaoCampo,
  "data_encerramento_proposta" | "valor_total_estimado" | "data_publicacao" | "score_aderencia"
> = {
  data_limite_proposta: "data_encerramento_proposta",
  valor_estimado: "valor_total_estimado",
  data_publicacao: "data_publicacao",
  score_aderencia: "score_aderencia",
};

export interface ConsultaUI {
  filtros: FiltrosLicitacoes;
  ordenarPor: OrdenacaoCampo;
  direcao: "asc" | "desc";
  pagina: number;
  itensPorPagina: number;
}

/** Remove filtros vazios: o servidor só recebe o que de fato restringe. */
function limparFiltros(f: FiltrosLicitacoes): Record<string, string | boolean> {
  const saida: Record<string, string | boolean> = {};
  for (const [chave, valor] of Object.entries(f)) {
    if (typeof valor === "boolean") {
      if (valor) saida[chave] = true;
    } else if (typeof valor === "string" && valor.trim() !== "") {
      saida[chave] = valor.trim();
    }
  }
  return saida;
}

export function useLicitacoes(consulta: ConsultaUI) {
  const filtros = limparFiltros(consulta.filtros);
  return useQuery<ResultadoBuscaDTO>({
    queryKey: [
      "licitacoes",
      filtros,
      consulta.ordenarPor,
      consulta.direcao,
      consulta.pagina,
      consulta.itensPorPagina,
    ],
    queryFn: () =>
      buscarLicitacoesFn({
        data: {
          filtros,
          ordenarPor: COLUNA_ORDENACAO[consulta.ordenarPor],
          direcao: consulta.direcao,
          pagina: consulta.pagina,
          itensPorPagina: consulta.itensPorPagina,
        },
      }),
    placeholderData: (anterior) => anterior,
  });
}

export function useLicitacao(id: string) {
  return useQuery<DetalheDTO | null>({
    queryKey: ["licitacao", id],
    queryFn: () => obterLicitacaoFn({ data: { id } }),
  });
}

export function useMetricas() {
  return useQuery<MetricasDTO>({ queryKey: ["metricas"], queryFn: () => metricasFn() });
}

export function useOpcoesFiltros() {
  return useQuery({ queryKey: ["opcoes-filtros"], queryFn: () => opcoesFiltrosFn() });
}

export function useModalidades() {
  return useQuery({
    queryKey: ["modalidades"],
    queryFn: () => listarModalidadesFn(),
    staleTime: 60 * 60 * 1000,
  });
}

export function useConfiguracoes() {
  return useQuery({ queryKey: ["configuracoes"], queryFn: () => obterConfiguracoesFn() });
}

export function useSalvarConfiguracoes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: PatchConfiguracoesDTO) => salvarConfiguracoesFn({ data: patch }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["configuracoes"] });
      await qc.invalidateQueries({ queryKey: ["licitacoes"] });
      await qc.invalidateQueries({ queryKey: ["metricas"] });
    },
  });
}

export interface AtualizacaoInterna {
  id: string;
  statusInterno?: StatusInterno;
  prioridade?: boolean;
  observacoes?: string;
  historico?: string;
}

export function useAtualizarInterno() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: AtualizacaoInterna) => atualizarInternoFn({ data: args }),
    onSuccess: async (_dados, variaveis) => {
      await qc.invalidateQueries({ queryKey: ["licitacoes"] });
      await qc.invalidateQueries({ queryKey: ["licitacao", variaveis.id] });
      await qc.invalidateQueries({ queryKey: ["metricas"] });
    },
  });
}

export function useSincronizacoes(limite = 20) {
  return useQuery<SincronizacaoDTO[]>({
    queryKey: ["sincronizacoes", limite],
    queryFn: () => listarSincronizacoesFn({ data: { limite } }),
  });
}

export interface EscopoSincronizacao {
  ufs?: string[] | undefined;
  modalidades?: number[] | undefined;
  horizonteDias?: number | undefined;
  emEtapas?: boolean | undefined;
  etapasHorizonteDias?: number[] | undefined;
}

export interface EscopoIncrementalUI {
  ufs?: string[];
  modalidades?: number[];
  sobreposicaoDias?: number;
  janelaDias?: number;
}

/**
 * A tela conduz a coleta: um tick por vez, até o job terminar.
 *
 * Em Cloudflare não há processo longo, então cada tick é curto e deixa
 * checkpoint. Fechar a aba não perde o que já foi gravado — o job fica parcial
 * e pode ser retomado. Na Fase 2 o cron assume esse laço.
 *
 * Conduz tanto a descoberta quanto o ciclo incremental, pelo mesmo laço: o
 * banco só admite uma sincronização ativa por vez.
 */
export function useSincronizacaoPNCP() {
  const qc = useQueryClient();
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Quantas janelas o ciclo incremental planejou: é a medida honesta do custo,
  // porque a rota exige modalidade e cada UF vira N partições.
  const [segmentosIncremental, setSegmentosIncremental] = useState<number | null>(null);
  const cancelado = useRef(false);

  const status = useQuery<ProgressoSyncDTO>({
    queryKey: ["sync-status"],
    queryFn: () => statusSincronizacaoFn({ data: {} }),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (rodando) return 6000;
      if (data?.job?.status === "em_andamento") return 3000;
      return false;
    },
  });

  const cobertura = useQuery<CoberturaIncrementalDTO>({
    queryKey: ["cobertura-incremental"],
    queryFn: () => coberturaIncrementalFn(),
    refetchInterval: () => {
      const s = status.data;
      if (s?.job?.tipo === "incremental" && s.job.status === "em_andamento") return 10_000;
      return false;
    },
  });

  const atualizarTelas = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["cobertura-incremental"] }),
      qc.invalidateQueries({ queryKey: ["sync-status"] }),
      qc.invalidateQueries({ queryKey: ["licitacoes"] }),
      qc.invalidateQueries({ queryKey: ["metricas"] }),
      qc.invalidateQueries({ queryKey: ["sincronizacoes"] }),
      qc.invalidateQueries({ queryKey: ["opcoes-filtros"] }),
    ]);
  }, [qc]);

  /**
   * Abre um job e conduz seus ticks até o fim.
   *
   * Descoberta e incremental compartilham este laço de propósito: o índice
   * único do banco permite uma sincronização ativa por vez, então a tela
   * também não pode oferecer as duas ao mesmo tempo.
   */
  const conduzir = useCallback(
    async (abrir: () => Promise<{ jobId: string }>) => {
      if (rodando) return;
      setRodando(true);
      setErro(null);
      cancelado.current = false;

      // Todo caminho de saída precisa encerrar o job. Um job abandonado em
      // 'em_andamento' trava o índice único e impede qualquer sincronização
      // seguinte, até alguém mexer no banco à mão.
      let jobId: string | null = null;
      let concluido = false;
      let manterParaRetomada = false;
      let motivo = "Interrompida pelo usuário";

      try {
        ({ jobId } = await abrir());

        // Teto de segurança: nunca laçar indefinidamente atrás de um conjunto
        // que pode estar mudando na fonte.
        let ticksCooldownSeguidos = 0;
        const MAX_COOLDOWN_RETRIES = 5;

        for (let volta = 0; volta < 300; volta++) {
          if (cancelado.current) break;

          const resumo = await executarTickFn({ data: { jobId } });
          await atualizarTelas();

          if (resumo.jobConcluido) {
            concluido = true;
            break;
          }

          // Tick fez progresso: resetar contador de cooldown e continuar.
          if (resumo.paginasAplicadas > 0) {
            ticksCooldownSeguidos = 0;
            continue;
          }

          // Tick sem progresso — distinguir cooldown de falha real.
          if (resumo.aguardandoCooldown) {
            ticksCooldownSeguidos++;
            if (ticksCooldownSeguidos >= MAX_COOLDOWN_RETRIES) {
              motivo = "PNCP instável: aguardando cooldown há muitos ciclos";
              manterParaRetomada = true;
              setErro("Fonte temporariamente indisponível. A sincronização será retomada na próxima execução.");
              break;
            }
            // Esperar 10 s e tentar outro tick — o cooldown no banco pode ter
            // passado e o segmento estará disponível novamente.
            await new Promise((r) => setTimeout(r, 10_000));
            continue;
          }

          // Tick sem progresso e sem cooldown, mas com erros: falha real.
          if (resumo.erros.length > 0) {
            motivo = `Fonte instável: ${resumo.erros[0] ?? "falha na coleta"}`;
            manterParaRetomada = true;
            setErro(resumo.erros[0] ?? "Falha na coleta");
            break;
          }

          if (volta === 299) motivo = "Teto de ciclos do navegador atingido";
        }
      } catch (e) {
        motivo = e instanceof Error ? e.message : "Falha ao sincronizar";
        setErro(motivo);
      } finally {
        // Falha transitória preserva o job ativo e seu checkpoint para a próxima
        // tentativa. Cancelamento, erro local ou teto do laço encerram como
        // parcial e liberam o single-flight.
        if (jobId && !concluido && !manterParaRetomada) {
          try {
            await interromperSincronizacaoFn({ data: { jobId, motivo: motivo.slice(0, 300) } });
          } catch {
            setErro(
              "A coleta parou e não foi possível encerrar o job. " +
                "Recarregue e interrompa pela tela antes de sincronizar de novo.",
            );
          }
        }
        setRodando(false);
        await atualizarTelas();
      }
    },
    [rodando, atualizarTelas],
  );

  const iniciar = useCallback(
    (escopo: EscopoSincronizacao = {}) => conduzir(() => iniciarSincronizacaoFn({ data: escopo })),
    [conduzir],
  );

  /**
   * Ciclo de atualização global: busca o que mudou desde a fronteira de
   * cobertura, em vez de recarregar o recorte inteiro.
   */
  const iniciarIncremental = useCallback(
    (opcoes: EscopoIncrementalUI = {}) =>
      conduzir(async () => {
        const r = await iniciarIncrementalFn({ data: opcoes });
        setSegmentosIncremental(r.segmentos);
        return r;
      }),
    [conduzir],
  );

  const interromper = useCallback(() => {
    cancelado.current = true;
  }, []);

  return {
    rodando,
    erro,
    status,
    iniciar,
    iniciarIncremental,
    segmentosIncremental,
    cobertura,
    interromper,
  };
}

/**
 * Coleta de documentos, conduzida pela tela pelo mesmo motivo da sincronização:
 * o runtime não tem processo longo, então a fila avança em ticks curtos e
 * retomáveis. A diferença é que aqui não existe job — a fila é o próprio estado
 * das licitações, e parar no meio só deixa o resto pendente.
 */
export function useColetaDocumentos() {
  const qc = useQueryClient();
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<ResumoColetaDocumentosDTO | null>(null);
  const cancelado = useRef(false);

  const cobertura = useQuery<CoberturaDocumentosDTO>({
    queryKey: ["documentos-cobertura"],
    queryFn: () => coberturaDocumentosFn(),
    refetchInterval: rodando ? 6000 : false,
  });

  const atualizarTelas = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["documentos-cobertura"] }),
      qc.invalidateQueries({ queryKey: ["licitacoes"] }),
      qc.invalidateQueries({ queryKey: ["licitacao"] }),
      qc.invalidateQueries({ queryKey: ["metricas"] }),
    ]);
  }, [qc]);

  const iniciar = useCallback(async () => {
    if (rodando) return;
    setRodando(true);
    setErro(null);
    cancelado.current = false;

    // Acumula o que os ticks fizeram: cada chamada devolve só a sua fatia.
    const total: ResumoColetaDocumentosDTO = {
      licitacoesProcessadas: 0,
      documentosGravados: 0,
      documentosRemovidos: 0,
      semDocumentos: 0,
      filaVazia: false,
      erros: [],
      duracaoMs: 0,
    };

    try {
      // Teto de segurança: nunca laçar indefinidamente atrás de uma fila que
      // pode crescer a cada sincronização.
      for (let volta = 0; volta < 300; volta++) {
        if (cancelado.current) break;

        const resumo = await executarTickDocumentosFn({ data: {} });

        total.licitacoesProcessadas += resumo.licitacoesProcessadas;
        total.documentosGravados += resumo.documentosGravados;
        total.documentosRemovidos += resumo.documentosRemovidos;
        total.semDocumentos += resumo.semDocumentos;
        total.duracaoMs += resumo.duracaoMs;
        total.filaVazia = resumo.filaVazia;
        total.erros = [...total.erros, ...resumo.erros].slice(0, 20);
        setProgresso({ ...total });

        await atualizarTelas();

        if (resumo.filaVazia) break;

        // Tick sem avanço e com erro é fonte degradada: parar e deixar
        // retomável, em vez de insistir contra um serviço instável.
        if (resumo.licitacoesProcessadas === 0 && resumo.erros.length > 0) {
          setErro(resumo.erros[0] ?? "Falha na coleta de documentos");
          break;
        }
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao coletar documentos");
    } finally {
      setRodando(false);
      await atualizarTelas();
    }
  }, [rodando, atualizarTelas]);

  const interromper = useCallback(() => {
    cancelado.current = true;
  }, []);

  return { rodando, erro, progresso, cobertura, iniciar, interromper };
}
