import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  ExternalLink,
  FileText,
  Info,
  MapPin,
  Package,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { EmptyState, ScoreBadge } from "@/components/data-bits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { STATUS_INTERNO_LABEL, type StatusInterno, type TipoDocumento } from "@/lib/types";
import { brl, dataBR, dataHoraBR, diasRestantes } from "@/lib/format";
import {
  useAnaliseLicitacao,
  useAtualizarInterno,
  useLicitacao,
  useSincronizarDocumentosLicitacao,
} from "@/services/api";
import { AnaliseLicitacaoSheet } from "@/components/AnaliseLicitacaoSheet";
import { ItensLicitacaoTab } from "@/components/ItensLicitacaoTab";
import { DadosAdicionaisTab } from "@/components/DadosAdicionaisTab";

export const Route = createFileRoute("/licitacoes/$id")({
  ssr: false,
  // `?analise=1` abre a análise com IA direto — é o destino do botão
  // "Converse com o edital" do card da listagem.
  validateSearch: (search: Record<string, unknown>): { analise?: boolean } =>
    search["analise"] === true || search["analise"] === 1 || search["analise"] === "1"
      ? { analise: true }
      : {},
  head: () => ({
    meta: [
      { title: "Detalhe da licitação | 3AM Licitação" },
      {
        name: "description",
        content:
          "Dados completos da licitação, documentos vinculados, status interno e observações da equipe.",
      },
      { property: "og:title", content: "Detalhe da licitação | 3AM Licitação" },
      {
        property: "og:description",
        content: "Ficha completa da oportunidade e seus documentos.",
      },
    ],
  }),
  component: DetalheLicitacao,
});

const GRUPOS: { tipo: TipoDocumento; label: string }[] = [
  { tipo: "edital", label: "Edital" },
  { tipo: "projeto", label: "Projetos" },
  { tipo: "orcamento", label: "Orçamentos" },
  { tipo: "anexo", label: "Anexos" },
  { tipo: "outro", label: "Outros" },
];

// Os três desfechos da triagem; o restante do funil fica no menu da listagem.
const DECISOES: {
  status: StatusInterno;
  label: string;
  icone: LucideIcon;
  estilo: { ativo: string; inativo: string };
}[] = [
  {
    status: "interessante",
    label: "Participar",
    icone: ThumbsUp,
    estilo: {
      ativo: "border-success bg-success text-success-foreground hover:bg-success/90",
      inativo: "border-success/30 text-success hover:bg-success/10",
    },
  },
  {
    status: "em_analise",
    label: "Analisar",
    icone: Search,
    estilo: {
      ativo: "border-warning bg-warning text-warning-foreground hover:bg-warning/90",
      inativo: "border-warning/30 text-warning hover:bg-warning/10",
    },
  },
  {
    status: "descartada",
    label: "Descartar",
    icone: ThumbsDown,
    estilo: {
      ativo:
        "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90",
      inativo: "border-destructive/30 text-destructive hover:bg-destructive/10",
    },
  },
];

function DetalheLicitacao() {
  const { id } = Route.useParams();
  const { data, isLoading } = useLicitacao(id);
  const atualizar = useAtualizarInterno();
  const [obs, setObs] = useState("");
  const [filtroDoc, setFiltroDoc] = useState("");
  const { analise } = Route.useSearch();
  const [sheetAnaliseAberta, setSheetAnaliseAberta] = useState(analise === true);
  const sincronizarDocs = useSincronizarDocumentosLicitacao(id);
  const { data: analiseData } = useAnaliseLicitacao(id);
  const analisePronta = Boolean(analiseData?.resultado || analiseData?.estado === "pronta");

  const licitacao = data?.licitacao;

  useEffect(() => {
    setObs(licitacao?.observacoes ?? "");
  }, [licitacao?.id, licitacao?.observacoes]);

  const salvarStatus = (v: StatusInterno) => {
    if (!licitacao) return;
    atualizar.mutate(
      {
        id: licitacao.id,
        statusInterno: v,
        historico: `Status interno alterado para: ${STATUS_INTERNO_LABEL[v]}`,
      },
      { onSuccess: () => toast.success(`Status definido como "${STATUS_INTERNO_LABEL[v]}".`) },
    );
  };

  const docsFiltrados = useMemo(() => {
    if (!data?.documentos) return [];
    const termo = filtroDoc.trim().toLowerCase();
    if (!termo) return data.documentos;
    return data.documentos.filter(
      (d) =>
        (d.nome ?? "").toLowerCase().includes(termo) ||
        (d.tipo_documento_pncp ?? "").toLowerCase().includes(termo),
    );
  }, [data?.documentos, filtroDoc]);

  if (isLoading) {
    return <AppShell titulo="Carregando…">{null}</AppShell>;
  }

  if (!data || !licitacao) {
    return (
      <AppShell titulo="Licitação não encontrada">
        <EmptyState
          titulo="Registro não encontrado no banco"
          descricao="A licitação pode ter sido removida. Volte para a lista de licitações salvas."
          acao={
            <Button asChild size="sm" className="mt-2">
              <Link to="/licitacoes">Voltar para Licitações Salvas</Link>
            </Button>
          }
        />
      </AppShell>
    );
  }

  const dias = licitacao.data_limite_proposta
    ? diasRestantes(licitacao.data_limite_proposta)
    : null;

  const titulo =
    [licitacao.modalidade, licitacao.processo].filter(Boolean).join(" · ") || licitacao.orgao;

  return (
    <AppShell
      titulo="Detalhe da licitação"
      descricao={`${licitacao.orgao} · ${licitacao.municipio ?? "—"}/${licitacao.uf ?? "—"}`}
      acoes={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Link to="/licitacoes">
              <ArrowLeft className="size-3.5" /> Voltar
            </Link>
          </Button>

          {licitacao.url_pncp && (
            <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <a href={licitacao.url_pncp} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-3.5" /> Ver no PNCP
              </a>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs cursor-pointer"
            disabled={atualizar.isPending}
            onClick={() =>
              atualizar.mutate({
                id: licitacao.id,
                prioridade: !licitacao.prioridade,
                historico: licitacao.prioridade
                  ? "Prioridade desmarcada"
                  : "Marcada como alta prioridade",
              })
            }
          >
            <Star
              className={cn(
                "size-3.5",
                licitacao.prioridade ? "fill-warning text-warning" : "text-muted-foreground",
              )}
            />
            {licitacao.prioridade ? "Prioritária" : "Marcar prioridade"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {/* COLUNA PRINCIPAL: resumo (valor e prazos) + itens e documentos */}
        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="size-3.5 shrink-0 text-primary" />
                  <span className="truncate">
                    {licitacao.orgao} · {licitacao.municipio ?? "—"}/{licitacao.uf ?? "—"}
                  </span>
                </p>
                <h2 className="mt-1 text-sm font-semibold uppercase text-brand">{titulo}</h2>
              </div>
              <ScoreBadge score={licitacao.score_aderencia} />
            </div>

            <p className="mt-3 text-sm leading-relaxed text-foreground/90 select-text">
              {licitacao.objeto}
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-muted/50 p-3">
                <span className="text-[11px] font-semibold text-primary">Valor estimado</span>
                <p className="num mt-1 text-xl font-bold tracking-tight text-foreground">
                  {licitacao.valor_estimado === null ? "Sigiloso" : brl(licitacao.valor_estimado)}
                </p>
              </div>

              <div
                className={cn(
                  "rounded-lg p-3",
                  dias !== null && dias >= 0 && dias <= 3
                    ? "bg-destructive/10"
                    : dias !== null && dias >= 0 && dias <= 7
                      ? "bg-warning/10"
                      : "bg-muted/50",
                )}
              >
                <span className="flex items-center gap-1 text-[11px] font-semibold text-primary">
                  <Clock className="size-3" /> Limite da proposta
                </span>
                <p className="num mt-1 text-base font-bold text-foreground">
                  {dataHoraBR(licitacao.data_limite_proposta)}
                </p>
                <p className="mt-0.5 text-[11px] font-medium">
                  {dias === null ? (
                    <span className="text-muted-foreground">Sem data informada</span>
                  ) : dias < 0 ? (
                    <span className="text-muted-foreground">Encerrada</span>
                  ) : dias === 0 ? (
                    <span className="font-bold text-destructive">Encerra hoje!</span>
                  ) : (
                    <span
                      className={
                        dias <= 3 ? "text-destructive" : dias <= 7 ? "text-warning" : "text-success"
                      }
                    >
                      Restam {dias} {dias === 1 ? "dia" : "dias"}
                    </span>
                  )}
                </p>
              </div>

              <div className="rounded-lg bg-muted/50 p-3 text-xs">
                <span className="flex items-center gap-1 text-[11px] font-semibold text-primary">
                  <CalendarClock className="size-3" /> Datas
                </span>
                <p className="mt-1.5 flex justify-between gap-2">
                  <span className="text-muted-foreground">Publicação</span>
                  <span className="num font-medium">{dataBR(licitacao.data_publicacao)}</span>
                </p>
                <p className="mt-0.5 flex justify-between gap-2">
                  <span className="text-muted-foreground">Abertura</span>
                  <span className="num font-medium">
                    {dataHoraBR(licitacao.data_abertura_proposta)}
                  </span>
                </p>
              </div>
            </div>
          </section>

          <Tabs defaultValue="itens" className="w-full">
            <TabsList>
              <TabsTrigger value="itens" className="gap-1.5 text-xs">
                <Package className="size-3.5" /> Itens
              </TabsTrigger>
              <TabsTrigger value="documentos" className="gap-1.5 text-xs">
                <FileText className="size-3.5" /> Documentos e editais ({licitacao.documentos_total}
                )
              </TabsTrigger>
              <TabsTrigger value="dados-adicionais" className="gap-1.5 text-xs">
                <ClipboardList className="size-3.5" /> Dados adicionais
              </TabsTrigger>
            </TabsList>

            <TabsContent value="itens" className="mt-3">
              <ItensLicitacaoTab licitacaoId={id} />
            </TabsContent>

            <TabsContent value="documentos" className="mt-3">
              <section className="rounded-xl border border-border bg-card shadow-sm">
                <header className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Buscar documento…"
                      value={filtroDoc}
                      onChange={(e) => setFiltroDoc(e.target.value)}
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      sincronizarDocs.mutate(undefined, {
                        onSuccess: (res) => {
                          if (res.totalCatalogados === 0 && res.erros.length > 0) {
                            toast.error(
                              "O PNCP não respondeu agora. Tente novamente em alguns minutos.",
                            );
                          } else {
                            toast.success(
                              `${res.totalCatalogados} documento(s) no catálogo, ${res.extraidos} pronto(s) para a IA.`,
                            );
                          }
                        },
                        onError: (err) => {
                          toast.error(
                            `Erro ao atualizar: ${err instanceof Error ? err.message : String(err)}`,
                          );
                        },
                      });
                    }}
                    disabled={sincronizarDocs.isPending}
                    className="h-8 gap-1.5 text-xs"
                  >
                    <RefreshCw
                      className={cn("size-3.5", sincronizarDocs.isPending && "animate-spin")}
                    />
                    {sincronizarDocs.isPending ? "Buscando no PNCP…" : "Atualizar documentos"}
                  </Button>
                </header>

                <div className="divide-y divide-border">
                  {docsFiltrados.length === 0 && data.documentos.length > 0 && (
                    <p className="p-6 text-center text-xs text-muted-foreground">
                      Nenhum documento encontrado.
                    </p>
                  )}

                  {GRUPOS.map(({ tipo, label }) => {
                    const docs = docsFiltrados.filter((d) => d.tipo_documento === tipo);
                    if (docs.length === 0) return null;
                    return (
                      <div key={tipo} className="px-4 py-3">
                        <p className="pb-1.5 text-[11px] font-semibold text-primary">
                          {label} ({docs.length})
                        </p>
                        <ul className="space-y-1">
                          {docs.map((d) => (
                            <li key={d.id}>
                              <a
                                href={d.url ?? undefined}
                                target="_blank"
                                rel="noreferrer"
                                className={cn(
                                  "flex items-center justify-between gap-3 rounded-md p-2 text-xs transition-colors hover:bg-muted/60",
                                  !d.ativo && "text-muted-foreground line-through",
                                )}
                              >
                                <span className="flex min-w-0 items-center gap-2">
                                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                                  <span className="truncate font-medium">
                                    {d.nome || "(sem título)"}
                                  </span>
                                </span>
                                <span className="flex shrink-0 items-center gap-2">
                                  <span className="num text-[11px] text-muted-foreground">
                                    {dataBR(d.data_publicacao)}
                                  </span>
                                  {d.url && <ExternalLink className="size-3 text-primary" />}
                                </span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}

                  {data.documentos.length === 0 && (
                    <div className="flex items-start gap-2 px-4 py-6 text-xs text-muted-foreground">
                      <Info className="mt-0.5 size-3.5 shrink-0" />
                      <p>
                        {data.documentosEstado === "coletando"
                          ? "Coleta de documentos em andamento."
                          : data.documentosEstado === "completo"
                            ? "O PNCP não publicou documentos para esta licitação."
                            : "Documentos ainda não coletados. Clique em “Atualizar documentos” ou consulte a publicação no PNCP."}
                      </p>
                    </div>
                  )}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="dados-adicionais" className="mt-3">
              <DadosAdicionaisTab licitacaoId={id} />
            </TabsContent>
          </Tabs>
        </div>

        {/* COLUNA LATERAL: análise com IA + decisão */}
        <div className="space-y-4">
          <section className="rounded-xl border border-teal/30 bg-teal/5 p-4 shadow-sm">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Sparkles className="size-4 text-teal" /> Análise com IA
            </h2>
            {analisePronta && analiseData?.resultado ? (
              <>
                <p className="mt-2 text-xs">
                  <span className="text-muted-foreground">Veredito: </span>
                  <span className="font-bold uppercase">{analiseData.resultado.veredito}</span>
                </p>
                {analiseData.resultado.resumoExecutivo && (
                  <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                    {analiseData.resultado.resumoExecutivo}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 text-xs leading-snug text-muted-foreground">
                A IA lê o edital e os anexos e aponta riscos, exigências e pontos de atenção.
              </p>
            )}
            <Button
              className="mt-3 w-full gap-1.5 bg-teal text-teal-foreground hover:bg-teal/90 cursor-pointer"
              onClick={() => setSheetAnaliseAberta(true)}
            >
              {analisePronta ? (
                <>
                  <CheckCircle2 className="size-4" /> Ver análise
                </>
              ) : (
                <>
                  <Sparkles className="size-4" /> Gerar análise com IA
                </>
              )}
            </Button>
          </section>

          <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground">Decisão</h2>

            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {DECISOES.map(({ status, label, icone: Icone, estilo }) => {
                const ativo = licitacao.status_interno === status;
                return (
                  <Button
                    key={status}
                    size="sm"
                    variant="outline"
                    disabled={atualizar.isPending}
                    onClick={() => salvarStatus(status)}
                    className={cn(
                      "w-full gap-1 px-2 text-xs font-semibold cursor-pointer",
                      ativo ? estilo.ativo : estilo.inativo,
                    )}
                  >
                    <Icone className="size-3.5" />
                    {label}
                  </Button>
                );
              })}
            </div>

            <div className="mt-4 space-y-2">
              <Label className="text-xs text-muted-foreground">Observações da equipe</Label>
              <Textarea
                rows={4}
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder="Anotações sobre viabilidade, acervo técnico, BDI…"
                className="resize-none text-xs"
              />
              <Button
                size="sm"
                className="w-full text-xs cursor-pointer"
                disabled={atualizar.isPending || obs === (licitacao.observacoes ?? "")}
                onClick={() =>
                  atualizar.mutate(
                    {
                      id: licitacao.id,
                      observacoes: obs,
                      historico: "Observações da equipe salvas",
                    },
                    { onSuccess: () => toast.success("Observações salvas.") },
                  )
                }
              >
                Salvar observações
              </Button>
            </div>
          </section>
        </div>
      </div>

      <AnaliseLicitacaoSheet
        licitacaoId={licitacao.id}
        aberto={sheetAnaliseAberta}
        onOpenChange={setSheetAnaliseAberta}
        objeto={licitacao.objeto}
        orgao={licitacao.orgao}
      />
    </AppShell>
  );
}
