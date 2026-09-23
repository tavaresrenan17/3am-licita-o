import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  BookOpen,
  CalendarClock,
  Download,
  ExternalLink,
  FileCheck,
  FileText,
  Filter,
  Library,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  CheckCircle2,
  AlertCircle,
  Undo2,
  ArchiveRestore,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { ScoreBadge, StatusInternoBadge, StatusPncpBadge, EmptyState } from "@/components/data-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { brl, dataBR, dataHoraBR, diasRestantes } from "@/lib/format";
import { STATUS_INTERNO_LABEL, type StatusInterno } from "@/lib/types";
import {
  useLicitacoesAlexandria,
  useAtualizarInterno,
  useAnalisarComIa,
  useRemoverDeAlexandria,
} from "@/services/api";
import { AnaliseLicitacaoSheet } from "@/components/AnaliseLicitacaoSheet";
import type { LicitacaoAlexandriaDTO } from "@/services/licitacoes.functions";

const alexandriaBuscaSchema = z.object({
  ids: z.string().optional(),
  busca: z.string().optional(),
  statusInterno: z.string().optional(),
});

export const Route = createFileRoute("/alexandria")({
  validateSearch: (search) => alexandriaBuscaSchema.parse(search),
  component: AlexandriaPage,
});

function AlexandriaPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [buscaTexto, setBuscaTexto] = useState(search.busca ?? "");
  const [statusFiltro, setStatusFiltro] = useState(search.statusInterno ?? "todos");

  const idsArray = useMemo(() => {
    if (!search.ids || !search.ids.trim()) return undefined;
    return search.ids
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }, [search.ids]);

  const { data: licitacoes = [], isLoading, refetch, isFetching } = useLicitacoesAlexandria({
    ids: idsArray,
    busca: buscaTexto || undefined,
    statusInterno: statusFiltro !== "todos" ? statusFiltro : undefined,
  });

  const atualizarInterno = useAtualizarInterno();
  const analisarIa = useAnalisarComIa();
  const [analisandoId, setAnalisandoId] = useState<string | null>(null);
  const [licitacaoAnaliseAberta, setLicitacaoAnaliseAberta] = useState<LicitacaoAlexandriaDTO | null>(null);

  const handleMudarStatus = (id: string, novoStatus: StatusInterno) => {
    atualizarInterno.mutate(
      {
        id,
        statusInterno: novoStatus,
        historico: `Status alterado em Alexandria para ${STATUS_INTERNO_LABEL[novoStatus]}`,
      },
      {
        onSuccess: () => {
          toast.success(`Status atualizado para ${STATUS_INTERNO_LABEL[novoStatus]}`);
          refetch();
        },
        onError: (err) => {
          toast.error(`Erro ao atualizar status: ${err instanceof Error ? err.message : String(err)}`);
        },
      },
    );
  };

  const handleAnalisarComIa = async (id: string) => {
    setAnalisandoId(id);
    toast.info("Iniciando análise semântica com Inteligência Artificial...");
    try {
      const res = await analisarIa.mutateAsync(id);
      if (res.ok) {
        toast.success("Análise de IA concluída com sucesso!");
        refetch();
      } else {
        toast.error(`Falha na análise: ${res.motivo ?? "Erro desconhecido"}`);
      }
    } catch (e) {
      toast.error(`Erro ao disparar IA: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAnalisandoId(null);
    }
  };

  const removerAlexandria = useRemoverDeAlexandria();

  const handleRemoverDeAlexandria = async (id: string) => {
    try {
      await removerAlexandria.mutateAsync([id]);
      toast.success("Licitação removida de Alexandria e devolvida à aba Licitações.");
      refetch();
    } catch (err) {
      toast.error(
        `Falha ao remover de Alexandria: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  // Métricas do Hub Alexandria
  const totalLicitacoes = licitacoes.length;
  const totalDocsBaixados = useMemo(
    () => licitacoes.reduce((acc, l) => acc + (l.documentos_baixados?.length ?? 0), 0),
    [licitacoes],
  );
  const totalAnalisadasIa = useMemo(
    () => licitacoes.filter((l) => l.analise_estado === "pronta").length,
    [licitacoes],
  );
  const valorTotal = useMemo(
    () => licitacoes.reduce((acc, l) => acc + (l.valor_estimado ?? 0), 0),
    [licitacoes],
  );

  return (
    <AppShell
      titulo="Alexandria — Acervo & Análise Cautelosa"
      descricao="Espaço dedicado para auditoria profunda, leitura de editais e acionamento de Inteligência Artificial."
      acoes={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 gap-1.5 text-xs cursor-pointer"
          >
            <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
            <span>Atualizar</span>
          </Button>
          <Button asChild size="sm" className="h-8 gap-1.5 text-xs">
            <Link to="/licitacoes">
              <Search className="size-3.5" />
              <span>Explorar Catálogo</span>
            </Link>
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* KPI Chips / Header Summary Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
            <p className="text-[11px] font-medium text-muted-foreground">Licitações no Acervo</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {totalLicitacoes}
              </span>
              {search.ids && (
                <span className="text-[11px] text-primary font-medium">(seleção ativa)</span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
            <p className="text-[11px] font-medium text-muted-foreground">Documentos Baixados</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tracking-tight text-success">
                {totalDocsBaixados}
              </span>
              <span className="text-xs text-muted-foreground">arquivos</span>
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
            <p className="text-[11px] font-medium text-muted-foreground">Análises de IA Prontas</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tracking-tight text-brand">
                {totalAnalisadasIa}
              </span>
              <span className="text-xs text-muted-foreground">de {totalLicitacoes}</span>
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
            <p className="text-[11px] font-medium text-muted-foreground">Valor Total Estimado</p>
            <p className="mt-1 text-lg font-bold tracking-tight text-foreground truncate">
              {brl(valorTotal)}
            </p>
          </div>
        </div>

        {/* Barra de Filtros Rápidos */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card/60 p-3 backdrop-blur-xs">
          <div className="flex flex-1 items-center gap-2 min-w-[240px]">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={buscaTexto}
                onChange={(e) => setBuscaTexto(e.target.value)}
                placeholder="Buscar por objeto, órgão ou município..."
                className="h-8 pl-8 text-xs bg-background"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Filter className="size-3.5" />
              <span>Status:</span>
            </div>
            <Select value={statusFiltro} onValueChange={setStatusFiltro}>
              <SelectTrigger className="h-8 w-[160px] text-xs bg-background">
                <SelectValue placeholder="Status Interno" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="nova">Nova</SelectItem>
                <SelectItem value="em_analise">Em análise</SelectItem>
                <SelectItem value="interessante">Interessante</SelectItem>
                <SelectItem value="proposta_enviada">Proposta enviada</SelectItem>
                <SelectItem value="descartada">Descartada</SelectItem>
              </SelectContent>
            </Select>

            {search.ids && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate({ to: "/alexandria" })}
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
              >
                Ver todas do acervo
              </Button>
            )}
          </div>
        </div>

        {/* Lista de Oportunidades no Acervo */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Carregando acervo de Alexandria…</p>
          </div>
        ) : licitacoes.length === 0 ? (
          <EmptyState
            icone={<Library className="size-8 text-muted-foreground" />}
            titulo="Nenhuma licitação no acervo de Alexandria"
            descricao="Selecione as oportunidades desejadas na aba Licitações e clique em 'Sincronizar Documentos' para enviá-las para análise cautelosa aqui."
            acao={
              <Button asChild size="sm" className="mt-2">
                <Link to="/licitacoes">Ir para Licitações e Selecionar</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4">
            {licitacoes.map((l) => {
              const dias = l.data_limite_proposta ? diasRestantes(l.data_limite_proposta) : null;
              const documentos = l.documentos_baixados ?? [];
              const emAnalise = analisandoId === l.id;

              return (
                <div
                  key={l.id}
                  className="rounded-xl border border-border/80 bg-card p-5 shadow-xs transition-all hover:border-border hover:shadow-md"
                >
                  {/* Top Bar do Card */}
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-primary">
                          {l.pncp_id}
                        </span>
                        <span className="text-muted-foreground text-xs">•</span>
                        <span className="text-xs font-medium text-foreground">
                          {l.orgao}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({l.municipio ?? "—"} / {l.uf ?? "—"})
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Modalidade: <strong className="text-foreground">{l.modalidade ?? "—"}</strong>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <ScoreBadge score={l.score_aderencia} />
                      <StatusPncpBadge status={l.status_pncp ?? "—"} />

                      {/* Seletor rápido de Status Interno */}
                      <Select
                        value={l.status_interno}
                        onValueChange={(val) => handleMudarStatus(l.id, val as StatusInterno)}
                      >
                        <SelectTrigger className="h-7 w-[130px] text-xs font-medium bg-muted/30">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nova">Nova</SelectItem>
                          <SelectItem value="em_analise">Em análise</SelectItem>
                          <SelectItem value="interessante">Interessante</SelectItem>
                          <SelectItem value="proposta_enviada">Proposta enviada</SelectItem>
                          <SelectItem value="descartada">Descartada</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Objeto */}
                  <div className="mt-3">
                    <Link
                      to="/licitacoes/$id"
                      params={{ id: l.id }}
                      className="text-sm font-semibold text-foreground hover:text-primary hover:underline line-clamp-2"
                    >
                      {l.objeto || "Objeto não informado"}
                    </Link>
                  </div>

                  {/* Detalhes Financeiros e Prazo */}
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground border-t border-border/40 pt-3">
                    <div>
                      <span>Valor Estimado: </span>
                      <strong className="text-sm font-bold text-foreground">
                        {brl(l.valor_estimado)}
                      </strong>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <CalendarClock className="size-3.5 text-muted-foreground" />
                      <span>Prazo de Propostas: </span>
                      <strong className="text-foreground">
                        {dataBR(l.data_limite_proposta)}
                        {dias !== null && ` (${dias}d restantes)`}
                      </strong>
                    </div>
                  </div>

                  {/* Seção de Documentos Baixados */}
                  <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <FileCheck className="size-4 text-success" />
                        <span className="text-xs font-semibold text-foreground">
                          Acervo Documental ({documentos.length} arquivo{documentos.length === 1 ? "" : "s"} baixado{documentos.length === 1 ? "" : "s"})
                        </span>
                      </div>
                      <span className="text-[11px] text-success font-medium">
                        ✓ Texto extraído para IA
                      </span>
                    </div>

                    {documentos.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic py-1">
                        Nenhum anexo foi baixado ainda para esta licitação.
                      </p>
                    ) : (
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {documentos.map((doc) => (
                          <div
                            key={doc.id}
                            className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-background/80 px-2.5 py-1.5 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="size-3.5 text-primary shrink-0" />
                              <span className="truncate font-medium" title={doc.nome}>
                                {doc.nome}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] text-muted-foreground">
                                {doc.paginas}p · {(doc.chars / 1000).toFixed(1)}k chars
                              </span>
                              {doc.url && (
                                <a
                                  href={doc.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary hover:text-primary/80"
                                  title="Baixar do PNCP"
                                >
                                  <Download className="size-3.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Seção de Análise IA e Ações */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-2">
                    <div className="flex items-center gap-2">
                      {l.analise_estado === "pronta" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setLicitacaoAnaliseAberta(l)}
                          className="h-8 gap-1.5 text-xs bg-success/15 border-success/40 text-success hover:bg-success/25 font-semibold cursor-pointer shadow-xs transition-all"
                          title="Abrir painel completo de Análise de IA desta licitação"
                        >
                          <CheckCircle2 className="size-3.5 text-success" />
                          <span>Ver Análise de IA (Salva)</span>
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          disabled={emAnalise}
                          onClick={() => setLicitacaoAnaliseAberta(l)}
                          className="h-8 gap-1.5 text-xs bg-teal text-teal-foreground shadow-xs hover:bg-teal/90 cursor-pointer"
                          title="Abrir painel para executar e visualizar a Análise de IA"
                        >
                          {emAnalise ? (
                            <>
                              <Loader2 className="size-3.5 animate-spin" />
                              <span>Processando IA…</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="size-3.5" />
                              <span>Analisar com IA</span>
                            </>
                          )}
                        </Button>
                      )}

                      {l.analise_resumo && (
                        <span className="text-xs text-muted-foreground line-clamp-1 max-w-md italic">
                          “{l.analise_resumo}”
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoverDeAlexandria(l.id)}
                        disabled={removerAlexandria.isPending}
                        className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer transition-colors"
                        title="Remover de Alexandria e devolver para a aba Licitações"
                      >
                        <Undo2 className="size-3.5" />
                        <span>Remover de Alexandria</span>
                      </Button>

                      <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                        <Link to="/licitacoes/$id" params={{ id: l.id }}>
                          <span>Abrir Ficha Completa</span>
                          <ExternalLink className="size-3" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {licitacaoAnaliseAberta && (
        <AnaliseLicitacaoSheet
          licitacaoId={licitacaoAnaliseAberta.id}
          aberto={Boolean(licitacaoAnaliseAberta)}
          onOpenChange={(aberto) => {
            if (!aberto) setLicitacaoAnaliseAberta(null);
          }}
          objeto={licitacaoAnaliseAberta.objeto}
          orgao={licitacaoAnaliseAberta.orgao}
        />
      )}
    </AppShell>
  );
}
