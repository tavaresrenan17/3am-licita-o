import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlarmClock,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Building2,
  Calendar,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  FileStack,
  Layers,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  TrendingUp,
  X,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, ScoreBadge, StatusInternoBadge } from "@/components/data-bits";
import { Button } from "@/components/ui/button";
import {
  brl,
  dataBR,
  dataHoraBR,
  diaBR,
  diasRestantes,
  numero,
  sincronizacaoEstaAtualizada,
} from "@/lib/format";
import { useAtualizarInterno, useLicitacoes, useMetricas } from "@/services/api";
import { filtrosVazios } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Dashboard Executivo | 3AM Licitação" },
      {
        name: "description",
        content:
          "Visão geral das licitações de construção civil salvas: prazos, valores e oportunidades prioritárias.",
      },
      { property: "og:title", content: "Dashboard Executivo | 3AM Licitação" },
      {
        property: "og:description",
        content: "Painel de análise de licitações públicas para construção civil.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: m, isLoading, isError, error } = useMetricas();
  const mutarInterno = useAtualizarInterno();

  const togglePrioridade = (id: string, atual: boolean) => {
    mutarInterno.mutate(
      {
        id,
        prioridade: !atual,
        historico: atual
          ? "Prioridade removida via Dashboard"
          : "Marcada como prioritária via Dashboard",
      },
      {
        onSuccess: () =>
          toast.success(atual ? "Prioridade removida." : "Marcada como prioritária."),
      },
    );
  };

  // Destaques: recomendadas pelo score e ainda abertas, ordenadas pelo prazo mais curto
  const destaques = useLicitacoes({
    filtros: { ...filtrosVazios, recomendadas: true, apenas_abertas: true },
    ordenarPor: "data_limite_proposta",
    direcao: "asc",
    pagina: 1,
    itensPorPagina: 8,
  });

  const sync = m?.ultima_sync ?? null;
  const catalogoAtualizado = sincronizacaoEstaAtualizada(sync?.status, sync?.finalizado_em);
  const [avisoDescartado, setAvisoDescartado] = useState(false);

  return (
    <AppShell
      titulo="Dashboard Executivo"
      descricao={
        sync
          ? `Última sincronização PNCP: ${dataHoraBR(sync.finalizado_em)} · ${sync.descricao_escopo}`
          : "Nenhuma sincronização registrada ainda"
      }
      acoes={
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Link to="/licitacoes">
              <Search className="size-3.5 text-muted-foreground" />
              <span>Explorar Licitações</span>
            </Link>
          </Button>
          <Button asChild size="sm" className="h-8 gap-1.5 text-xs">
            <Link to="/sincronizacao">
              <RefreshCw className="size-3.5" />
              <span>Sincronizar PNCP</span>
            </Link>
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Alerta de erro de banco */}
        {isError && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive">
            <p className="font-semibold text-sm">Não foi possível conectar ao banco de dados</p>
            <p className="mt-1">{error instanceof Error ? error.message : "Erro desconhecido."}</p>
          </div>
        )}

        {/* Alerta se o catálogo estiver desatualizado */}
        {!isLoading && !isError && !catalogoAtualizado && !avisoDescartado && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3.5 text-xs text-warning">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <div>
                <p className="font-semibold">Catálogo precisa de atualização</p>
                <p className="mt-0.5 text-foreground/80">
                  {sync?.finalizado_em
                    ? `A última sincronização válida terminou em ${dataHoraBR(sync.finalizado_em)}.`
                    : "Ainda não existe uma sincronização concluída com o PNCP."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm" className="h-7 text-xs border-warning/40 text-warning hover:bg-warning/20">
                <Link to="/sincronizacao">Sincronizar Agora</Link>
              </Button>
              <button
                type="button"
                onClick={() => setAvisoDescartado(true)}
                title="Fechar aviso"
                aria-label="Fechar aviso de atualização"
                className="inline-flex size-7 cursor-pointer items-center justify-center rounded-lg text-warning/70 hover:bg-warning/20 hover:text-warning transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-warning"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        )}

        {/* ======================================================================= */}
        {/* BENTO GRID: HERO BANNER EXECUTIVO COM MÉTRICAS CHAVE                    */}
        {/* ======================================================================= */}
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card Hero 1: Volume Total Estimado */}
          <div className="bento-card group p-4 sm:col-span-2 relative overflow-hidden">
            <div className="absolute right-0 top-0 -mt-4 -mr-4 size-32 rounded-full bg-primary/10 blur-2xl pointer-events-none" />
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <CircleDollarSign className="size-4 text-primary" />
                Volume Total em Disputa
              </span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary border border-primary/20">
                Obras & Serviços
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-mono text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                {m ? brl(m.valor_total) : "Carregando…"}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Distribuídos em <strong className="text-foreground">{m ? numero(m.total) : "—"}</strong> oportunidades salvas no catálogo local.
            </p>
          </div>

          {/* Card 2: Alta Aderência (Score >= 70%) */}
          <div className="bento-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <BadgeCheck className="size-4 text-success" />
                Alta Aderência
              </span>
              <span className="size-2 rounded-full bg-success animate-pulse-subtle" />
            </div>
            <div className="mt-3">
              <span className="font-mono text-2xl font-extrabold text-success">
                {m ? numero(m.recomendadas) : "—"}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Com classificação máxima de compatibilidade para obras civis.
            </p>
          </div>

          {/* Card 3: Prazos Críticos (≤ 7 dias) */}
          <div className="bento-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <AlarmClock className="size-4 text-warning" />
                Prazos Próximos
              </span>
              <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                ≤ 7 dias
              </span>
            </div>
            <div className="mt-3">
              <span className="font-mono text-2xl font-extrabold text-warning">
                {m ? numero(m.prazo_proximo) : "—"}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Sessões com encerramento de propostas iminente.
            </p>
          </div>
        </div>

        {/* ======================================================================= */}
        {/* BENTO GRID: CARDS SECUNDÁRIOS RÁPIDOS                                   */}
        {/* ======================================================================= */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            to="/licitacoes"
            search={{ apenas_abertas: true }}
            className="bento-card p-3.5 hover:bg-muted/30 transition-all block"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Propostas Abertas
              </span>
              <span className="size-2 rounded-full bg-success" />
            </div>
            <p className="font-mono text-xl font-bold text-foreground mt-1.5">
              {m ? numero(m.abertas) : "—"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Recebendo envelopes</p>
          </Link>

          <Link
            to="/licitacoes"
            search={{ prioridade: "true" }}
            className="bento-card p-3.5 hover:bg-muted/30 transition-all block"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Marcadas Prioritárias
              </span>
              <Star className="size-3.5 text-primary fill-primary" />
            </div>
            <p className="font-mono text-xl font-bold text-primary mt-1.5">
              {m ? numero(m.prioritarias) : "—"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Selecionadas pela equipe</p>
          </Link>

          <Link
            to="/licitacoes"
            search={{ status_interno: "nova" }}
            className="bento-card p-3.5 hover:bg-muted/30 transition-all block"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Não Analisadas
              </span>
              <span className="size-2 rounded-full bg-info" />
            </div>
            <p className="font-mono text-xl font-bold text-foreground mt-1.5">
              {m ? numero(m.nao_analisadas) : "—"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Pendentes de triagem</p>
          </Link>

          <Link
            to="/sincronizacao"
            className="bento-card p-3.5 hover:bg-muted/30 transition-all block"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Novas na Última Carga
              </span>
              <Sparkles className="size-3.5 text-info" />
            </div>
            <p className="font-mono text-xl font-bold text-info mt-1.5">
              {m ? numero(m.novas_ultima_sync) : "—"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Capturadas no PNCP</p>
          </Link>
        </div>

        {/* ======================================================================= */}
        {/* CORPO PRINCIPAL: OPORTUNIDADES EM DESTAQUE + WIDGETS DE ENGENHARIA      */}
        {/* ======================================================================= */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* COLUNA ESQUERDA (2/3): OPORTUNIDADES RECOMENDADAS */}
          <section className="bento-card lg:col-span-2">
            <header className="flex items-center justify-between border-b border-border/70 px-4 py-3.5">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Sparkles className="size-4 text-primary" />
                  <span>Oportunidades em Destaque (Engenharia Civil)</span>
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Recomendadas pelo algoritmo de aderência com proposta aberta e prazo mais iminente
                </p>
              </div>
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-primary hover:text-primary/90">
                <Link to="/licitacoes" search={{ recomendadas: true, apenas_abertas: true }}>
                  Ver todas <ArrowRight className="ml-1 size-3" />
                </Link>
              </Button>
            </header>

            <div className="divide-y divide-border/60">
              {destaques.data?.itens.length === 0 && !destaques.isLoading && (
                <EmptyState
                  titulo={
                    m && m.total > 0 ? "Nenhuma recomendada com proposta aberta" : "Catálogo ainda vazio"
                  }
                  descricao={
                    m && m.total > 0
                      ? `O banco possui ${numero(m.total)} licitações, mas nenhuma atende aos filtros de recomendação com proposta aberta no momento.`
                      : "Execute uma sincronização com o PNCP para alimentar o catálogo com oportunidades."
                  }
                  acao={
                    <Button asChild size="sm" className="mt-2 text-xs">
                      {m && m.total > 0 ? (
                        <Link to="/licitacoes">Explorar todas as licitações</Link>
                      ) : (
                        <Link to="/sincronizacao">Ir para Sincronização PNCP</Link>
                      )}
                    </Button>
                  }
                />
              )}

              {(destaques.isLoading || isLoading) && (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  Carregando oportunidades em destaque…
                </div>
              )}

              {destaques.data?.itens.map((l) => {
                const dias = l.data_limite_proposta ? diasRestantes(l.data_limite_proposta) : null;
                return (
                  <div
                    key={l.id}
                    className="group relative flex flex-col justify-between p-4 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePrioridade(l.id, l.prioridade);
                            }}
                            className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-primary cursor-pointer"
                            title={l.prioridade ? "Remover prioridade" : "Marcar como prioritária"}
                          >
                            <Star
                              className={cn(
                                "size-3.5",
                                l.prioridade
                                  ? "fill-primary text-primary"
                                  : "text-muted-foreground/50 hover:text-primary",
                              )}
                            />
                          </button>
                          <p className="truncate text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground/90">{l.municipio ?? "—"} / {l.uf ?? "—"}</span> · {l.orgao}
                          </p>
                        </div>
                        <Link
                          to="/licitacoes/$id"
                          params={{ id: l.id }}
                          className="mt-1.5 block"
                        >
                          <p className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-primary transition-colors">
                            {l.objeto}
                          </p>
                        </Link>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="font-mono text-sm font-bold text-foreground">
                          {brl(l.valor_estimado)}
                        </p>
                        <span
                          className={cn(
                            "num mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                            dias !== null && dias <= 3
                              ? "bg-destructive/15 text-destructive border border-destructive/20"
                              : dias !== null && dias <= 7
                                ? "bg-warning/15 text-warning border border-warning/20"
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          <Clock className="size-2.5" />
                          {dias === null
                            ? "sem prazo"
                            : dias === 0
                              ? "Encerra hoje!"
                              : dias > 0
                                ? `${dias}d restantes`
                                : "Encerrada"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/40 pt-2.5">
                      <div className="flex items-center gap-2">
                        <StatusInternoBadge status={l.status_interno} />
                        <ScoreBadge score={l.score_aderencia} />
                        <span className="text-[10px] text-muted-foreground hidden sm:inline">
                          {l.categoria}
                        </span>
                      </div>
                      <Link
                        to="/licitacoes/$id"
                        params={{ id: l.id }}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                      >
                        Abrir Oportunidade <ArrowRight className="size-3" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* COLUNA DIREITA (1/3): WIDGETS LATERAIS BENTO */}
          <div className="space-y-4">
            {/* Widget 1: Pipeline da Construtora */}
            <div className="bento-card p-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                <div>
                  <h3 className="text-sm font-bold text-foreground">Pipeline da Construtora</h3>
                  <p className="text-[11px] text-muted-foreground">Funil de triagem de obras</p>
                </div>
                <span className="font-mono text-xs font-bold text-primary">
                  {m ? numero(m.total) : "—"}
                </span>
              </div>

              <div className="mt-3 space-y-1.5">
                <Link
                  to="/licitacoes"
                  search={{ status_interno: "nova", apenas_abertas: true }}
                  className="group flex items-center justify-between rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/40 border border-border/30"
                >
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-info" />
                    <span className="text-xs text-muted-foreground group-hover:text-foreground">Não Analisadas</span>
                  </div>
                  <span className="font-mono text-xs font-semibold">{m ? numero(m.nao_analisadas) : "—"}</span>
                </Link>

                <Link
                  to="/licitacoes"
                  search={{ recomendadas: true, apenas_abertas: true }}
                  className="group flex items-center justify-between rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/40 border border-border/30"
                >
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-success" />
                    <span className="text-xs text-muted-foreground group-hover:text-foreground">Alta Aderência Obras</span>
                  </div>
                  <span className="font-mono text-xs font-semibold text-success">{m ? numero(m.recomendadas) : "—"}</span>
                </Link>

                <Link
                  to="/licitacoes"
                  search={{ prioridade: "true", apenas_abertas: true }}
                  className="group flex items-center justify-between rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/40 border border-border/30"
                >
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-primary" />
                    <span className="text-xs text-muted-foreground group-hover:text-foreground">Marcadas Prioritárias</span>
                  </div>
                  <span className="font-mono text-xs font-semibold text-primary">{m ? numero(m.prioritarias) : "—"}</span>
                </Link>

                <Link
                  to="/licitacoes"
                  search={{ apenas_abertas: true, limite_ate: diaBR(7) }}
                  className="group flex items-center justify-between rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/40 border border-border/30"
                >
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-warning" />
                    <span className="text-xs text-muted-foreground group-hover:text-foreground">Prazos Críticos (≤ 7d)</span>
                  </div>
                  <span className="font-mono text-xs font-semibold text-warning">{m ? numero(m.prazo_proximo) : "—"}</span>
                </Link>
              </div>
            </div>

            {/* Widget 2: Principais Localidades */}
            <div className="bento-card p-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-foreground border-b border-border/60 pb-2.5">
                <MapPin className="size-4 text-primary" />
                <span>Principais Localidades</span>
              </h3>
              <ul className="mt-3 space-y-2">
                {(m?.top_locais ?? []).slice(0, 5).map((t) => (
                  <li key={t.local} className="text-xs">
                    <div className="flex items-center justify-between">
                      <span className="truncate text-muted-foreground">{t.local}</span>
                      <span className="font-mono font-medium text-foreground">{t.qtd}</span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted/60">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${(t.qtd / (m?.top_locais[0]?.qtd || 1)) * 100}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
                {m?.top_locais.length === 0 && (
                  <li className="text-xs text-muted-foreground">Sem dados registrados.</li>
                )}
              </ul>
            </div>

            {/* Widget 3: Categorias de Obras */}
            <div className="bento-card p-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-foreground border-b border-border/60 pb-2.5">
                <Building2 className="size-4 text-primary" />
                <span>Obras por Categoria</span>
              </h3>
              <ul className="mt-3 space-y-1.5 text-xs">
                {(m?.por_categoria ?? []).map((c) => (
                  <li key={c.categoria} className="flex items-center justify-between rounded p-1 hover:bg-muted/30">
                    <span className="text-muted-foreground truncate">{c.categoria}</span>
                    <span className="font-mono font-semibold text-foreground">{c.qtd}</span>
                  </li>
                ))}
                {m?.por_categoria.length === 0 && (
                  <li className="text-muted-foreground text-xs">Sem categorias no banco.</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
