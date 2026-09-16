import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlarmClock,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CircleDollarSign,
  FileStack,
  MapPin,
  RefreshCw,
  Sparkles,
  Star,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, MetricCard, ScoreBadge, StatusInternoBadge } from "@/components/data-bits";
import { PainelOportunidades } from "@/components/oportunidades";
import { Button } from "@/components/ui/button";
import {
  brl,
  dataBR,
  dataHoraBR,
  diasRestantes,
  numero,
  sincronizacaoEstaAtualizada,
} from "@/lib/format";
import { useLicitacoes, useMetricas } from "@/services/api";
import { filtrosVazios } from "@/lib/types";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Dashboard | 3AM Licitação" },
      {
        name: "description",
        content:
          "Visão geral das licitações de construção civil salvas: prazos, valores e oportunidades prioritárias.",
      },
      { property: "og:title", content: "Dashboard | 3AM Licitação" },
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

  // Destaques: recomendadas pelo score e ainda abertas, pelo prazo mais curto.
  // O filtro roda no banco, sobre o catálogo inteiro.
  const destaques = useLicitacoes({
    filtros: { ...filtrosVazios, recomendadas: true, apenas_abertas: true },
    ordenarPor: "data_limite_proposta",
    direcao: "asc",
    pagina: 1,
    itensPorPagina: 8,
  });

  const sync = m?.ultima_sync ?? null;
  const catalogoAtualizado = sincronizacaoEstaAtualizada(sync?.status, sync?.finalizado_em);

  return (
    <AppShell
      titulo="Dashboard"
      descricao={
        sync
          ? `Última sincronização: ${dataHoraBR(sync.finalizado_em)} · ${sync.descricao_escopo}`
          : "Nenhuma sincronização registrada ainda"
      }
      acoes={
        <>
          <Button asChild variant="outline" size="sm">
            <Link to="/licitacoes">
              Licitações Salvas <ArrowRight className="ml-1 size-3.5" />
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/sincronizacao">
              <RefreshCw className="mr-1 size-3.5" /> Sincronização PNCP
            </Link>
          </Button>
        </>
      }
    >
      {/* Sem isto, uma falha de banco vira "carregando…" para sempre e o motivo
          real fica escondido no console. */}
      {isError && (
        <div className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          <p className="font-semibold">Não foi possível ler o banco</p>
          <p className="mt-1">{error instanceof Error ? error.message : "Erro desconhecido."}</p>
          <p className="mt-1 opacity-80">
            Verifique se as migrações foram aplicadas no Supabase e se a chave de serviço está
            configurada no ambiente do servidor.
          </p>
        </div>
      )}

      {!isLoading && !isError && !catalogoAtualizado && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-semibold">Catálogo desatualizado</p>
              <p className="mt-0.5 text-foreground/75">
                {sync?.finalizado_em
                  ? `A última rotina válida terminou em ${dataHoraBR(sync.finalizado_em)}.`
                  : "Ainda não existe uma sincronização concluída."}
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/sincronizacao">Ver sincronização</Link>
          </Button>
        </div>
      )}

      <PainelOportunidades m={m} carregando={isLoading} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 min-[112.5rem]:grid-cols-7">
        <MetricCard
          label="Licitações salvas"
          valor={m ? numero(m.total) : "—"}
          detalhe={m ? `${numero(m.nao_analisadas)} ainda não analisadas` : "carregando…"}
          icon={FileStack}
        />
        <MetricCard
          label="Novas na última sync"
          valor={m ? numero(m.novas_ultima_sync) : "—"}
          detalhe={m ? `${numero(m.atualizadas_ultima_sync)} registros atualizados` : "—"}
          icon={Sparkles}
          destaque="info"
        />
        <MetricCard
          label="Prazo próximo (7 dias)"
          valor={m ? numero(m.prazo_proximo) : "—"}
          detalhe={m ? `${numero(m.abertas)} com proposta aberta` : "—"}
          icon={AlarmClock}
          destaque="warning"
        />
        <MetricCard
          label="Valor estimado total"
          valor={m ? brl(m.valor_total) : "—"}
          // Valor não divulgado fica de fora da soma: dizer quantos são evita
          // ler o total como se cobrisse tudo.
          detalhe={m ? `${numero(m.sem_valor)} sem valor divulgado` : "—"}
          icon={CircleDollarSign}
          destaque="primary"
        />
        <MetricCard
          label="Prioritárias"
          valor={m ? numero(m.prioritarias) : "—"}
          detalhe="Marcadas pela equipe"
          icon={Star}
          destaque="primary"
        />
        <MetricCard
          label="Recomendadas"
          valor={m ? numero(m.recomendadas) : "—"}
          detalhe="Pelo score de aderência"
          icon={BadgeCheck}
          destaque="success"
        />
        <MetricCard
          label="Última sincronização"
          valor={sync ? dataHoraBR(sync.finalizado_em) : "—"}
          detalhe={
            sync
              ? `${numero(sync.registros_consultados)} registros consultados no PNCP`
              : "Nenhuma sincronização registrada"
          }
          icon={RefreshCw}
        />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <section className="rounded-lg border border-border bg-card lg:col-span-2">
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Oportunidades em destaque</h2>
              <p className="text-[11px] text-muted-foreground">
                Recomendadas pelo score e com proposta aberta, pelo prazo mais curto
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/licitacoes">Ver todas</Link>
            </Button>
          </header>

          <div className="divide-y divide-border">
            {destaques.data?.itens.length === 0 && !destaques.isLoading && (
              // Catálogo cheio e destaque vazio são coisas diferentes: dizer
              // "nenhuma oportunidade aberta" com 52 abertas no banco seria falso.
              <EmptyState
                titulo={
                  m && m.total > 0 ? "Nenhuma recomendada com proposta aberta" : "Banco ainda vazio"
                }
                descricao={
                  m && m.total > 0
                    ? `O banco tem ${numero(m.total)} licitações, ${numero(m.abertas)} com proposta aberta, mas nenhuma alcança o score mínimo de aderência à construção civil. Reveja as palavras-chave e o score nas Configurações, ou abra a lista completa.`
                    : "Execute uma sincronização com o PNCP para trazer licitações do recorte configurado."
                }
                acao={
                  <Button asChild size="sm" className="mt-2">
                    {m && m.total > 0 ? (
                      <Link to="/licitacoes">Ver licitações salvas</Link>
                    ) : (
                      <Link to="/sincronizacao">Ir para Sincronização PNCP</Link>
                    )}
                  </Button>
                }
              />
            )}

            {(destaques.isLoading || isLoading) && (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">Carregando…</p>
            )}

            {destaques.data?.itens.map((l) => {
              const dias = l.data_limite_proposta ? diasRestantes(l.data_limite_proposta) : null;
              return (
                <Link
                  key={l.id}
                  to="/licitacoes/$id"
                  params={{ id: l.id }}
                  className="block px-4 py-3 transition-colors hover:bg-accent/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {l.prioridade && <Star className="size-3 fill-primary text-primary" />}
                        {l.municipio ?? "—"} / {l.uf ?? "—"} · {l.modalidade ?? "—"}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-sm">{l.objeto}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="num text-sm font-semibold">{brl(l.valor_estimado)}</p>
                      <p
                        className={
                          dias !== null && dias <= 7
                            ? "num text-[11px] text-warning"
                            : "num text-[11px] text-muted-foreground"
                        }
                      >
                        {dias === null
                          ? "sem prazo informado"
                          : dias >= 0
                            ? `${dias} dias`
                            : "encerrada"}{" "}
                        · {dataBR(l.data_limite_proposta)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <StatusInternoBadge status={l.status_interno} />
                    <ScoreBadge score={l.score_aderencia} />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <MapPin className="size-4 text-primary" /> Principais localidades
            </h2>
            <ul className="mt-3 space-y-2">
              {(m?.top_locais ?? []).map((t) => (
                <li key={t.local} className="text-xs">
                  <div className="flex items-center justify-between">
                    <span className="truncate text-muted-foreground">{t.local}</span>
                    <span className="num font-medium">{t.qtd}</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
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
                <li className="text-xs text-muted-foreground">Sem dados no banco.</li>
              )}
            </ul>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">Por categoria</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Classificação nossa, a partir do objeto — não é campo do PNCP.
            </p>
            <ul className="mt-3 space-y-1.5 text-xs">
              {(m?.por_categoria ?? []).map((c) => (
                <li key={c.categoria} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{c.categoria}</span>
                  <span className="num font-medium">{c.qtd}</span>
                </li>
              ))}
              {m?.por_categoria.length === 0 && (
                <li className="text-muted-foreground">Sem dados no banco.</li>
              )}
            </ul>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
