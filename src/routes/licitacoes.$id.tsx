import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Calendar,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Coins,
  Copy,
  ExternalLink,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  History,
  Info,
  MapPin,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { EmptyState, ScoreBadge, StatusPncpBadge } from "@/components/data-bits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  SITUACAO_TEMPORAL_LABEL,
  STATUS_INTERNO_LABEL,
  type StatusInterno,
  type TipoDocumento,
} from "@/lib/types";
import { brl, dataBR, dataHoraBR, diasRestantes } from "@/lib/format";
import {
  useAnaliseLicitacao,
  useAtualizarInterno,
  useLicitacao,
  useSincronizarDocumentosLicitacao,
} from "@/services/api";
import { ChecklistDocumental, CronogramaLegal } from "@/components/EngenhariaWidgets";
import { AnaliseLicitacaoSheet } from "@/components/AnaliseLicitacaoSheet";

export const Route = createFileRoute("/licitacoes/$id")({
  ssr: false,
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

function DetalheLicitacao() {
  const { id } = Route.useParams();
  const { data, isLoading } = useLicitacao(id);
  const atualizar = useAtualizarInterno();
  const [obs, setObs] = useState("");
  const [copiadoObjeto, setCopiadoObjeto] = useState(false);
  const [filtroDoc, setFiltroDoc] = useState("");
  const [tipoFiltroDoc, setTipoFiltroDoc] = useState<string>("todos");
  const [sheetAnaliseAberta, setSheetAnaliseAberta] = useState(false);
  const sincronizarDocs = useSincronizarDocumentosLicitacao(id);
  const { data: analiseData } = useAnaliseLicitacao(id);
  const analisePronta = Boolean(analiseData?.resultado || analiseData?.estado === "pronta");

  const licitacao = data?.licitacao;

  useEffect(() => {
    setObs(licitacao?.observacoes ?? "");
  }, [licitacao?.id, licitacao?.observacoes]);

  const copiarTextoObjeto = () => {
    if (!licitacao?.objeto) return;
    navigator.clipboard.writeText(licitacao.objeto);
    setCopiadoObjeto(true);
    toast.success("Objeto da licitação copiado para a área de transferência!");
    setTimeout(() => setCopiadoObjeto(false), 2500);
  };

  const copiarResumoExecutivo = () => {
    if (!licitacao) return;
    const texto = [
      `🏛️ ÓRGÃO: ${licitacao.orgao} (${licitacao.municipio ?? "—"}/${licitacao.uf ?? "—"})`,
      `📄 PROCESSO: ${licitacao.processo ?? "—"} | MODALIDADE: ${licitacao.modalidade ?? "—"}`,
      `💰 VALOR ESTIMADO: ${brl(licitacao.valor_estimado)}`,
      `⏰ LIMITE PROPOSTA: ${dataHoraBR(licitacao.data_limite_proposta)}`,
      `📊 ADERÊNCIA OBRAS: ${licitacao.score_aderencia}%`,
      `📝 OBJETO: ${licitacao.objeto}`,
      licitacao.url_pncp ? `🔗 PNCP: ${licitacao.url_pncp}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    navigator.clipboard.writeText(texto);
    toast.success("Resumo executivo copiado para compartilhar!");
  };

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

  // Filtragem dos documentos vinculados
  const docsFiltrados = useMemo(() => {
    if (!data?.documentos) return [];
    return data.documentos.filter((d) => {
      const matchTexto =
        !filtroDoc.trim() ||
        (d.nome ?? "").toLowerCase().includes(filtroDoc.toLowerCase()) ||
        (d.tipo_documento_pncp ?? "").toLowerCase().includes(filtroDoc.toLowerCase());
      const matchTipo = tipoFiltroDoc === "todos" || d.tipo_documento === tipoFiltroDoc;
      return matchTexto && matchTipo;
    });
  }, [data?.documentos, filtroDoc, tipoFiltroDoc]);

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

  // Métricas estimadas de engenharia (Lei 14.133/2021)
  const capitalSocialMinimo =
    licitacao.valor_estimado && licitacao.valor_estimado > 0
      ? licitacao.valor_estimado * 0.1
      : null;
  const garantiaPropostaMaxima =
    licitacao.valor_estimado && licitacao.valor_estimado > 0
      ? licitacao.valor_estimado * 0.01
      : null;
  const garantiaContratual =
    licitacao.valor_estimado && licitacao.valor_estimado > 0
      ? licitacao.valor_estimado * 0.05
      : null;

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

          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs cursor-pointer"
            onClick={copiarResumoExecutivo}
            title="Copiar resumo estruturado para WhatsApp ou relatório"
          >
            <Copy className="size-3.5" /> Copiar Resumo
          </Button>

          <Button
            size="sm"
            className={cn(
              "h-8 gap-1.5 text-xs shadow-sm cursor-pointer font-medium transition-colors",
              analisePronta
                ? "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500/30 shadow-emerald-950/20"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
            onClick={() => setSheetAnaliseAberta(true)}
            title={
              analisePronta
                ? "Ver Análise com IA setorizada (Já gerada e salva no cadastro)"
                : "Análise aprofundada dos editais e projetos com Inteligência Artificial"
            }
          >
            {analisePronta ? (
              <>
                <CheckCircle2 className="size-3.5 text-emerald-200" /> Ver Análise com IA (Salva)
              </>
            ) : (
              <>
                <Sparkles className="size-3.5" /> Analisar com IA
              </>
            )}
          </Button>

          {licitacao.url_pncp && (
            <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <a href={licitacao.url_pncp} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-3.5" /> Ver no PNCP Oficial
              </a>
            </Button>
          )}

          <Button
            size="sm"
            className={cn(
              "h-8 gap-1.5 text-xs cursor-pointer transition-all",
              licitacao.prioridade
                ? "bg-amber-500/20 text-amber-400 border-amber-500/50 hover:bg-amber-500/30"
                : "variant-outline",
            )}
            variant={licitacao.prioridade ? "secondary" : "outline"}
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
                licitacao.prioridade ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
              )}
            />
            {licitacao.prioridade ? "Prioritária" : "Marcar prioridade"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* ======================================================================= */}
        {/* HERO CARD EXECUTIVO: METRICAS CHAVE E OBJETO COM DESTAQUE IMEDIATO     */}
        {/* ======================================================================= */}
        <div className="overflow-hidden rounded-xl border border-border/90 bg-gradient-to-br from-card via-card/95 to-muted/20 p-5 shadow-sm">
          {/* Top Line: Tags, Status, Localização */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/60">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPncpBadge status={licitacao.status_pncp ?? "—"} />

              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider",
                  licitacao.situacao_temporal === "aberta"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : licitacao.situacao_temporal === "indeterminada" ||
                        licitacao.situacao_temporal === "inconsistente"
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                      : "border-border bg-muted/40 text-muted-foreground",
                )}
              >
                {SITUACAO_TEMPORAL_LABEL[licitacao.situacao_temporal] ??
                  licitacao.situacao_temporal}
              </span>

              {licitacao.srp && (
                <span className="inline-flex items-center rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-medium text-sky-400">
                  Registro de Preços (SRP)
                </span>
              )}

              {licitacao.modalidade && (
                <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                  {licitacao.modalidade}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3.5 text-primary shrink-0" />
              <span className="font-medium text-foreground">
                {licitacao.municipio ?? "—"} / {licitacao.uf ?? "—"}
              </span>
              <span className="text-muted-foreground/60">·</span>
              <span className="truncate max-w-xs">{licitacao.orgao}</span>
            </div>
          </div>

          {/* Grid de 4 Cards de Métricas Cruciais */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1. Valor Estimado */}
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Valor Total Estimado
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="font-mono text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  {brl(licitacao.valor_estimado)}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground truncate">
                {licitacao.srp ? "Possível ata de registro" : "Orçamento base de referência"}
              </p>
            </div>

            {/* 2. Prazo Limite e Contagem Regressiva */}
            <div
              className={cn(
                "rounded-lg border p-3 transition-colors",
                dias !== null && dias <= 3 && dias >= 0
                  ? "border-rose-500/40 bg-rose-500/10"
                  : dias !== null && dias <= 7 && dias >= 0
                    ? "border-amber-500/40 bg-amber-500/10"
                    : "border-border/60 bg-muted/30",
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span>Limite para Proposta</span>
                <Clock className="size-3 text-muted-foreground" />
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="font-mono text-lg font-bold text-foreground">
                  {dataHoraBR(licitacao.data_limite_proposta)}
                </span>
              </div>
              <p className="mt-1 text-[11px] font-medium">
                {dias === null ? (
                  <span className="text-muted-foreground">Sem data limite informada</span>
                ) : dias < 0 ? (
                  <span className="text-muted-foreground">Sessão já encerrada</span>
                ) : dias === 0 ? (
                  <span className="text-rose-400 font-bold">Encerra hoje!</span>
                ) : (
                  <span
                    className={
                      dias <= 3 ? "text-rose-400 font-semibold" : "text-amber-400 font-semibold"
                    }
                  >
                    Restam {dias} {dias === 1 ? "dia" : "dias"} corridos
                  </span>
                )}
              </p>
            </div>

            {/* 3. Aderência para Obras Civis */}
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span>Aderência Construção Civil</span>
                <Scale className="size-3 text-primary" />
              </span>
              <div className="mt-1 flex items-center gap-2">
                <ScoreBadge score={licitacao.score_aderencia} className="text-sm font-bold" />
                <span className="text-xs text-muted-foreground">
                  {licitacao.score_aderencia >= 75
                    ? "Altamente compatível"
                    : licitacao.score_aderencia >= 50
                      ? "Média aderência"
                      : "Baixa aderência"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground truncate">
                Cat: <span className="font-medium text-foreground">{licitacao.categoria}</span>
              </p>
            </div>

            {/* 4. Processo & Identificador */}
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Processo / Identificação
              </span>
              <div className="mt-1">
                <p className="font-mono text-sm font-semibold text-foreground truncate">
                  {licitacao.processo || licitacao.pncp_id}
                </p>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground truncate">
                CNPJ: <span className="font-mono">{licitacao.cnpj_orgao}</span>
              </p>
            </div>
          </div>

          {/* Bloco de Destaque do Objeto com Botão de Cópia */}
          <div className="mt-4 rounded-lg border border-border/70 bg-card/80 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground">
                <FileText className="size-4 text-primary" /> Objeto da Licitação
              </h2>
              <button
                type="button"
                onClick={copiarTextoObjeto}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors cursor-pointer"
                title="Copiar texto do objeto"
              >
                {copiadoObjeto ? (
                  <>
                    <Check className="size-3 text-emerald-400" />
                    <span className="text-emerald-400">Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3" />
                    <span>Copiar Objeto</span>
                  </>
                )}
              </button>
            </div>

            <p className="mt-2 text-sm leading-relaxed text-foreground/90 select-text">
              {licitacao.objeto}
            </p>

            {licitacao.informacao_complementar && (
              <div className="mt-3 rounded border-l-2 border-primary/60 bg-muted/40 p-2.5 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground/80 mb-0.5">
                  Informações Complementares:
                </p>
                <p className="whitespace-pre-line leading-relaxed">
                  {licitacao.informacao_complementar}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ======================================================================= */}
        {/* CORPO PRINCIPAL: ABAS ESPECIALIZADAS + COCKPIT LATERAL DE DECISÃO        */}
        {/* ======================================================================= */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* COLUNA ESQUERDA (2/3): TABS ESTRUTURADAS */}
          <div className="space-y-4 lg:col-span-2">
            <Tabs defaultValue="prazos" className="w-full">
              <TabsList className="grid w-full grid-cols-3 bg-card border border-border p-1">
                <TabsTrigger value="prazos" className="gap-1.5 text-xs">
                  <CalendarClock className="size-3.5" />
                  <span>Prazos & Dados</span>
                </TabsTrigger>
                <TabsTrigger value="documentos" className="gap-1.5 text-xs">
                  <FileSpreadsheet className="size-3.5" />
                  <span>Documentos ({data.licitacao.documentos_total})</span>
                </TabsTrigger>
                <TabsTrigger value="viabilidade" className="gap-1.5 text-xs">
                  <ShieldCheck className="size-3.5" />
                  <span>Matriz Viabilidade</span>
                </TabsTrigger>
              </TabsList>

              {/* ABA 1: PRAZOS LEGAIS & DADOS ADMINISTRATIVOS */}
              <TabsContent value="prazos" className="space-y-4 mt-3">
                {/* Cronograma Legal & Prazos da Lei 14.133 */}
                <CronogramaLegal
                  dataPublicacao={licitacao.data_publicacao}
                  dataLimite={licitacao.data_limite_proposta}
                  dataAbertura={licitacao.data_abertura_proposta}
                />

                {/* Ficha Técnica Administrativa Estruturada */}
                <section className="rounded-xl border border-border bg-card p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground border-b border-border/60 pb-2.5">
                    <Building2 className="size-4 text-primary" /> Ficha Técnica da Licitação
                  </h3>

                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    {/* Bloco 1: Contratação */}
                    <div className="space-y-2 rounded-lg bg-muted/20 p-3 border border-border/50">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Dados de Contratação
                      </p>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Modalidade:</span>
                          <span className="font-medium text-foreground">
                            {licitacao.modalidade ?? "—"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Processo:</span>
                          <span className="font-mono font-medium text-foreground">
                            {licitacao.processo ?? "—"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Registro de Preço (SRP):</span>
                          <span className="font-medium text-foreground">
                            {licitacao.srp ? "Sim" : "Não"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Categoria da Oportunidade:</span>
                          <span className="font-medium text-foreground">{licitacao.categoria}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Situação no PNCP:</span>
                          <span className="font-medium text-foreground">
                            {licitacao.status_pncp ?? "—"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Bloco 2: Órgão Contratante */}
                    <div className="space-y-2 rounded-lg bg-muted/20 p-3 border border-border/50">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Órgão & Localização
                      </p>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Órgão:</span>
                          <span
                            className="font-medium text-foreground text-right truncate max-w-[200px]"
                            title={licitacao.orgao}
                          >
                            {licitacao.orgao}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">CNPJ:</span>
                          <span className="font-mono font-medium text-foreground">
                            {licitacao.cnpj_orgao}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Unidade:</span>
                          <span className="font-medium text-foreground text-right truncate max-w-[200px]">
                            {licitacao.unidade_nome ?? "—"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Município / UF:</span>
                          <span className="font-medium text-foreground">
                            {licitacao.municipio ?? "—"} / {licitacao.uf ?? "—"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Controle PNCP:</span>
                          <span
                            className="font-mono text-[11px] text-muted-foreground truncate max-w-[180px]"
                            title={licitacao.pncp_id}
                          >
                            {licitacao.pncp_id}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Links oficiais externos */}
                  <div className="mt-4 flex flex-wrap gap-4 border-t border-border/50 pt-3">
                    {licitacao.url_pncp && (
                      <a
                        href={licitacao.url_pncp}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="size-3.5" /> Abrir publicação no PNCP
                      </a>
                    )}
                    {licitacao.link_sistema_origem && (
                      <a
                        href={licitacao.link_sistema_origem}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="size-3.5" /> Acessar sistema de compras de origem
                      </a>
                    )}
                  </div>
                </section>
              </TabsContent>

              {/* ABA 2: DOCUMENTOS, ANEXOS & PEÇAS TÉCNICAS */}
              <TabsContent value="documentos" className="space-y-4 mt-3">
                {/* Checklist de Prontidão Documental para Obras */}
                <ChecklistDocumental
                  documentos={data.documentos}
                  documentosEstado={data.documentosEstado}
                  urlPncp={licitacao.url_pncp}
                />

                {/* Explorador de Arquivos com Busca e Filtro */}
                <section className="rounded-xl border border-border bg-card">
                  <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border p-4">
                    <div>
                      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                        <Building2 className="size-4 text-primary" /> Arquivos e Peças Técnicas
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {data.licitacao.documentos_total} arquivos vinculados
                        {data.documentosColetadoEm &&
                          ` · Coletados em ${dataBR(data.documentosColetadoEm)}`}
                      </p>
                    </div>

                    {/* Barra de Filtro Rápido e Ação Sob Demanda */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          sincronizarDocs.mutate(undefined, {
                            onSuccess: (res) => {
                              toast.success(
                                `Sincronização concluída! ${res.extraidos} arquivo(s) prontos para a IA.`,
                              );
                            },
                            onError: (err) => {
                              toast.error(
                                `Erro ao sincronizar: ${err instanceof Error ? err.message : String(err)}`,
                              );
                            },
                          });
                        }}
                        disabled={sincronizarDocs.isPending}
                        className="h-8 gap-1.5 text-xs text-primary border-primary/30 hover:bg-primary/10"
                      >
                        <RefreshCw
                          className={cn("size-3.5", sincronizarDocs.isPending && "animate-spin")}
                        />
                        {sincronizarDocs.isPending ? "Lendo do PNCP..." : "Sincronizar Arquivos"}
                      </Button>

                      <div className="relative w-full sm:w-48">
                        <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Buscar arquivo…"
                          value={filtroDoc}
                          onChange={(e) => setFiltroDoc(e.target.value)}
                          className="h-8 pl-8 text-xs bg-background"
                        />
                      </div>
                      <Select value={tipoFiltroDoc} onValueChange={setTipoFiltroDoc}>
                        <SelectTrigger className="h-8 w-28 text-xs">
                          <SelectValue placeholder="Tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos tipos</SelectItem>
                          <SelectItem value="edital">Edital</SelectItem>
                          <SelectItem value="projeto">Projetos</SelectItem>
                          <SelectItem value="orcamento">Orçamentos</SelectItem>
                          <SelectItem value="anexo">Anexos</SelectItem>
                          <SelectItem value="outro">Outros</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </header>

                  {/* Lista de Documentos */}
                  <div className="divide-y divide-border">
                    {docsFiltrados.length === 0 && data.documentos.length > 0 && (
                      <div className="p-6 text-center text-xs text-muted-foreground">
                        Nenhum documento encontrado com o filtro aplicado.
                      </div>
                    )}

                    {GRUPOS.map(({ tipo, label }) => {
                      const docs = docsFiltrados.filter((d) => d.tipo_documento === tipo);
                      if (docs.length === 0) return null;
                      return (
                        <div key={tipo} className="px-4 py-3">
                          <div className="flex items-center justify-between pb-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                              {tipo === "orcamento" ? (
                                <FileSpreadsheet className="size-3 text-emerald-400" />
                              ) : tipo === "edital" ? (
                                <FileText className="size-3 text-primary" />
                              ) : (
                                <FileCheck2 className="size-3 text-sky-400" />
                              )}
                              {label} ({docs.length})
                            </span>
                          </div>

                          <ul className="mt-1 space-y-1.5">
                            {docs.map((d) => (
                              <li
                                key={d.id}
                                className="flex items-center justify-between gap-3 rounded-md p-2 hover:bg-muted/40 transition-colors text-xs"
                              >
                                <a
                                  href={d.url ?? "#"}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={cn(
                                    "flex min-w-0 items-center gap-2 hover:text-primary transition-colors",
                                    !d.ativo && "text-muted-foreground line-through",
                                  )}
                                  title={
                                    d.tipo_documento_pncp
                                      ? `PNCP: ${d.tipo_documento_pncp}`
                                      : "Tipo não declarado pelo PNCP"
                                  }
                                >
                                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                                  <span className="truncate font-medium text-foreground">
                                    {d.nome || "(sem título)"}
                                  </span>
                                </a>

                                <div className="flex items-center gap-2 shrink-0">
                                  {!d.ativo && (
                                    <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-400">
                                      retirado
                                    </span>
                                  )}
                                  <span className="font-mono text-[11px] text-muted-foreground">
                                    {dataBR(d.data_publicacao)}
                                  </span>
                                  {d.url && (
                                    <Button
                                      asChild
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 w-6 p-0 hover:bg-muted"
                                    >
                                      <a
                                        href={d.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        title="Baixar ou abrir documento"
                                      >
                                        <ExternalLink className="size-3 text-primary" />
                                      </a>
                                    </Button>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}

                    {/* Mensagens de estado da coleta */}
                    {data.documentosEstado !== "completo" && (
                      <div className="flex items-start gap-2 px-4 py-6 text-xs text-muted-foreground">
                        <Info className="mt-0.5 size-3.5 shrink-0" />
                        <p>
                          {data.documentosEstado === "coletando" ? (
                            <>Coleta de documentos em andamento para esta licitação.</>
                          ) : data.documentosEstado === "erro" ? (
                            <>
                              Não foi possível coletar os documentos desta licitação
                              {data.documentosErro ? `: ${data.documentosErro}` : "."} Você pode
                              consultar os anexos diretamente na publicação oficial do PNCP.
                            </>
                          ) : (
                            <>
                              Os documentos não foram copiados para o catálogo. Consulte os anexos
                              na publicação oficial do PNCP.
                            </>
                          )}
                        </p>
                      </div>
                    )}

                    {data.documentosEstado === "completo" && data.documentos.length === 0 && (
                      <div className="flex items-start gap-2 px-4 py-6 text-xs text-muted-foreground">
                        <Info className="mt-0.5 size-3.5 shrink-0" />
                        <p>
                          O PNCP não publicou nenhum documento para esta licitação
                          {data.documentosColetadoEm
                            ? ` (consultado em ${dataBR(data.documentosColetadoEm)})`
                            : ""}
                          . Aqui isso é uma ausência confirmada na fonte, não coleta pendente.
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              </TabsContent>

              {/* ABA 3: MATRIZ DE VIABILIDADE & REQUISITOS DE ENGENHARIA */}
              <TabsContent value="viabilidade" className="space-y-4 mt-3">
                <section className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between border-b border-border/60 pb-3">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Coins className="size-4 text-emerald-400" />
                      <span>Parâmetros de Qualificação Econômico-Financeira (Lei 14.133)</span>
                    </h3>
                    <span className="text-[11px] text-muted-foreground">Estimativas legais</span>
                  </div>

                  <p className="mt-2 text-xs text-muted-foreground">
                    Valores de referência calculados com base nas exigências habituais da Nova Lei
                    de Licitações para construtoras e fornecedores de obras:
                  </p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Capital Social Mínimo (~10%)
                      </span>
                      <p className="font-mono text-base font-bold text-foreground mt-1">
                        {capitalSocialMinimo ? brl(capitalSocialMinimo) : "—"}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Art. 69, § 4º (Patrimônio Líquido ou Capital Social mínimo exigível)
                      </p>
                    </div>

                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Garantia de Proposta (~1%)
                      </span>
                      <p className="font-mono text-base font-bold text-foreground mt-1">
                        {garantiaPropostaMaxima ? brl(garantiaPropostaMaxima) : "—"}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Art. 58 (Bid bond para habilitação prévia)
                      </p>
                    </div>

                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Garantia de Execução (~5%)
                      </span>
                      <p className="font-mono text-base font-bold text-foreground mt-1">
                        {garantiaContratual ? brl(garantiaContratual) : "—"}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Art. 98 (Caução, seguro-garantia ou fiança bancária)
                      </p>
                    </div>
                  </div>

                  {/* Checklist de Viabilidade Operacional */}
                  <div className="mt-5 border-t border-border/60 pt-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground mb-2.5">
                      Checklist Rápido de Viabilidade Operacional (Engenharia)
                    </h4>
                    <div className="grid gap-2 sm:grid-cols-2 text-xs">
                      <div className="flex items-start gap-2 rounded-lg border border-border/50 p-2.5 bg-muted/10">
                        <CheckCircle2 className="size-4 text-emerald-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-medium text-foreground">Acervo Técnico (CAT)</p>
                          <p className="text-[11px] text-muted-foreground">
                            Verificar se a empresa possui ART/CAT averbada no CREA para o objeto.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2 rounded-lg border border-border/50 p-2.5 bg-muted/10">
                        <CheckCircle2 className="size-4 text-emerald-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-medium text-foreground">Raio de Operação</p>
                          <p className="text-[11px] text-muted-foreground">
                            Localização em {licitacao.municipio}/{licitacao.uf} atende a logística
                            da equipe.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2 rounded-lg border border-border/50 p-2.5 bg-muted/10">
                        <CheckCircle2 className="size-4 text-emerald-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-medium text-foreground">Prazos de Execução</p>
                          <p className="text-[11px] text-muted-foreground">
                            Consultar cronograma físico-financeiro no edital para alocação de
                            equipe.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2 rounded-lg border border-border/50 p-2.5 bg-muted/10">
                        <CheckCircle2 className="size-4 text-emerald-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-medium text-foreground">Margem de BDI</p>
                          <p className="text-[11px] text-muted-foreground">
                            Planilha de orçamento de referência disponível para estudo de custos.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </TabsContent>
            </Tabs>
          </div>

          {/* COLUNA DIREITA (1/3): COCKPIT DE DECISÃO GO/NO-GO E ANÁLISE INTERNA */}
          <div className="space-y-4">
            {/* Card de Análise com IA (Salva / Gerar) */}
            <section
              className={cn(
                "rounded-xl border p-4 shadow-sm transition-colors",
                analisePronta
                  ? "border-emerald-500/30 bg-emerald-950/20"
                  : "border-primary/30 bg-primary/5",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Sparkles className="size-3.5 text-primary" /> Análise com IA
                </span>
                {analisePronta ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/30">
                    <CheckCircle2 className="size-3" /> Salva no Cadastro
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">Não gerada</span>
                )}
              </div>

              {analisePronta && analiseData?.resultado ? (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Veredito IA:</span>
                    <span className="font-bold uppercase tracking-wider text-foreground">
                      {analiseData.resultado.veredito}
                    </span>
                  </div>
                  {analiseData.resultado.resumoExecutivo && (
                    <p className="line-clamp-2 text-[11px] text-muted-foreground leading-relaxed">
                      {analiseData.resultado.resumoExecutivo}
                    </p>
                  )}
                  <p className="text-[10px] text-emerald-300/80 font-mono">
                    ✓ Relatório salvo permanentemente nesta licitação
                  </p>
                  <Button
                    size="sm"
                    className="w-full h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer mt-1"
                    onClick={() => setSheetAnaliseAberta(true)}
                  >
                    <CheckCircle2 className="size-3.5" /> Abrir Relatório Setorizado
                  </Button>
                </div>
              ) : (
                <div className="mt-2.5 space-y-2">
                  <p className="text-xs text-muted-foreground leading-snug">
                    Analise os editais e anexos com IA para setorizar pontos importantes, riscos e o que é dispensável.
                  </p>
                  <p className="text-[10px] text-muted-foreground/80 italic">
                    Ao gerar, o relatório é salvo de forma definitiva na licitação.
                  </p>
                  <Button
                    size="sm"
                    className="w-full h-8 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                    onClick={() => setSheetAnaliseAberta(true)}
                  >
                    <Sparkles className="size-3.5" /> Gerar Análise com IA
                  </Button>
                </div>
              )}
            </section>

            {/* Bloco de Decisão Rápida (GO / NO-GO) */}
            <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Decisão da Construtora
              </h2>

              {/* Botões Rápidos de Triagem Comercial */}
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                <Button
                  size="sm"
                  variant={licitacao.status_interno === "interessante" ? "default" : "outline"}
                  className={cn(
                    "w-full gap-1 px-2 text-xs font-semibold cursor-pointer",
                    licitacao.status_interno === "interessante"
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                      : "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10",
                  )}
                  disabled={atualizar.isPending}
                  onClick={() => salvarStatus("interessante")}
                >
                  <Star className={cn("size-3.5", licitacao.status_interno === "interessante" && "fill-white")} />
                  <span>Interessante</span>
                </Button>

                <Button
                  size="sm"
                  variant={licitacao.status_interno === "em_analise" ? "default" : "outline"}
                  className={cn(
                    "w-full gap-1 px-2 text-xs font-semibold cursor-pointer",
                    licitacao.status_interno === "em_analise"
                      ? "bg-amber-600 hover:bg-amber-700 text-white"
                      : "border-amber-500/30 text-amber-400 hover:bg-amber-500/10",
                  )}
                  disabled={atualizar.isPending}
                  onClick={() => salvarStatus("em_analise")}
                >
                  <Search className="size-3.5" />
                  <span>Em Análise</span>
                </Button>

                <Button
                  size="sm"
                  variant={licitacao.status_interno === "descartada" ? "destructive" : "outline"}
                  className={cn(
                    "w-full gap-1 px-2 text-xs font-semibold cursor-pointer",
                    licitacao.status_interno === "descartada"
                      ? "bg-rose-600 hover:bg-rose-700 text-white"
                      : "border-rose-500/30 text-rose-400 hover:bg-rose-500/10",
                  )}
                  disabled={atualizar.isPending}
                  onClick={() => salvarStatus("descartada")}
                >
                  <XCircle className="size-3.5" />
                  <span>Descartar</span>
                </Button>
              </div>

              {/* Seletor de Status Interno Detalhado */}
              <div className="mt-3 space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Fase no Funil Interno</Label>
                <Select
                  value={licitacao.status_interno}
                  onValueChange={(v) => salvarStatus(v as StatusInterno)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_INTERNO_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k} className="text-xs">
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Observações Internas */}
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] text-muted-foreground">Observações da Equipe</Label>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {obs.length} caracteres
                  </span>
                </div>

                <Textarea
                  rows={5}
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  placeholder="Anotações sobre viabilidade, acervo técnico, BDI, concorrentes conhecidos…"
                  className="text-xs resize-none"
                />

                {/* Motivos Rápidos em 1 clique */}
                <div className="space-y-1.5 pt-1">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Atalhos de Análise (clique para anexar):
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {[
                      "Falta Acervo Técnico (CAT)",
                      "Margem Inexequível",
                      "Prazo Muito Curto",
                      "Logística / Raio Inviável",
                      "Edital Restritivo",
                      "Alta Margem / Viável",
                      "Acervo Técnico Pleno",
                    ].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          const prefixo = obs ? `${obs}\n• ` : "• ";
                          setObs(`${prefixo}${tag}`);
                        }}
                        className="rounded border border-border/70 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground hover:border-primary/50 hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                      >
                        + {tag}
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  size="sm"
                  className="w-full text-xs cursor-pointer"
                  disabled={atualizar.isPending}
                  onClick={() =>
                    atualizar.mutate(
                      {
                        id: licitacao.id,
                        observacoes: obs,
                        historico: "Observações da equipe salvas",
                      },
                      { onSuccess: () => toast.success("Observações salvas com sucesso.") },
                    )
                  }
                >
                  Salvar anotações
                </Button>
              </div>
            </section>

            {/* Linha do Tempo de Alterações */}
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <History className="size-3.5 text-primary" /> Histórico da Oportunidade
              </h2>
              <ul className="mt-3 space-y-2.5">
                {data.historico.map((h) => (
                  <li key={h.id} className="border-l-2 border-border/80 pl-2.5 text-xs">
                    <p className="text-foreground leading-snug">{h.texto}</p>
                    <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                      {dataHoraBR(h.em)} ·{" "}
                      {h.origem === "pncp" ? "sincronização automática" : "equipe interna"}
                    </p>
                  </li>
                ))}
                {data.historico.length === 0 && (
                  <li className="text-xs text-muted-foreground">
                    Sem alterações registradas até o momento.
                  </li>
                )}
              </ul>
            </section>

            {/* Auditoria do Banco e Sincronização */}
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <CalendarClock className="size-3.5 text-primary" /> Rastreabilidade PNCP
              </h2>
              <ul className="mt-2.5 space-y-1 text-xs text-muted-foreground">
                <li className="flex justify-between">
                  <span>Publicação Oficial:</span>
                  <span className="font-mono font-medium text-foreground">
                    {dataBR(licitacao.data_publicacao)}
                  </span>
                </li>
                <li className="flex justify-between">
                  <span>Sincronização:</span>
                  <span className="font-mono font-medium text-foreground">
                    {dataHoraBR(licitacao.synced_at)}
                  </span>
                </li>
                <li className="flex justify-between">
                  <span>Última alteração:</span>
                  <span className="font-mono font-medium text-foreground">
                    {dataHoraBR(licitacao.updated_at)}
                  </span>
                </li>
              </ul>
            </section>
          </div>
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
