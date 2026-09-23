import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Check,
  ExternalLink,
  Eye,
  Heart,
  MessageSquarePlus,
  MoreHorizontal,
  Search,
  Send,
  Share2,
  Sparkles,
  Star,
  XCircle,
} from "lucide-react";
import type { LicitacaoDTO } from "@/lib/dto";
import { brl, dataBR, diasRestantes } from "@/lib/format";
import { SITUACAO_TEMPORAL_LABEL, STATUS_INTERNO_LABEL, type StatusInterno } from "@/lib/types";
import { ScoreBadge, StatusPncpBadge } from "@/components/data-bits";
import { DistanceBadge } from "@/components/geo/DistanceBadge";
import { LicitacaoCardArquivosTab } from "@/components/licitacao-card/ArquivosTab";
import {
  STATUS_ICON_TOM,
  dataHoraExtenso,
  montarTituloLicitacao,
  urgenciaInfo,
} from "@/components/licitacao-card/helpers";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** Um par rótulo/valor da grade de "Detalhes". Rótulo em negrito text-primary, valor normal. */
function CampoDetalhe({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 text-xs">
      <dt className="shrink-0 font-bold text-primary">{label}</dt>
      <dd className="min-w-0 text-foreground">{children}</dd>
    </div>
  );
}

export function LicitacaoCard({
  licitacao: l,
  onSetStatus,
  onTogglePrioridade,
  onAbrirObs,
  selecionada,
  onToggleSelecionar,
}: {
  licitacao: LicitacaoDTO;
  onSetStatus: (id: string, status: StatusInterno) => void;
  onTogglePrioridade: (id: string, atual: boolean) => void;
  onAbrirObs: (id: string) => void;
  selecionada?: boolean;
  onToggleSelecionar?: (id: string) => void;
}) {
  const dias = l.data_limite_proposta ? diasRestantes(l.data_limite_proposta) : null;
  const objeto =
    l.objeto && l.objeto.trim().toLowerCase() !== "null" ? l.objeto : "Objeto não informado";
  const titulo = montarTituloLicitacao(l);
  const urgencia = urgenciaInfo(dias);

  const compartilhar = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/licitacoes/${l.id}`;
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      toast.error("Este navegador só libera a cópia em HTTPS. Copie a URL da barra.");
      return;
    }
    void navigator.clipboard
      .writeText(url)
      .then(() => toast.success("Link da licitação copiado"))
      .catch(() => toast.error("Não consegui copiar o link"));
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5",
        selecionada && "border-primary/50 ring-2 ring-primary/40",
      )}
    >
      {/* Barra superior: status, órgão, urgência | score, ações rápidas */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {onToggleSelecionar && (
            <Checkbox
              checked={selecionada ?? false}
              onCheckedChange={() => onToggleSelecionar(l.id)}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Selecionar licitação ${objeto}`}
              className="mr-0.5 size-4"
            />
          )}

          <span
            className={cn(
              "flex size-6.5 shrink-0 items-center justify-center rounded-full border",
              STATUS_ICON_TOM[l.status_interno],
            )}
            title={`Status interno: ${STATUS_INTERNO_LABEL[l.status_interno]}`}
          >
            <Eye className="size-3.5" />
          </span>

          <span
            className="inline-flex max-w-[220px] items-center truncate rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary"
            title={l.orgao}
          >
            {l.orgao}
          </span>

          <span
            className={cn(
              "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
              urgencia.classes,
            )}
          >
            {urgencia.label}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <ScoreBadge score={l.score_aderencia} />

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePrioridade(l.id, l.prioridade);
            }}
            className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive cursor-pointer"
            title={l.prioridade ? "Remover prioridade" : "Marcar como prioritária"}
          >
            <Heart className={cn("size-4", l.prioridade && "fill-destructive text-destructive")} />
          </button>

          <button
            type="button"
            onClick={compartilhar}
            className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-primary cursor-pointer"
            title="Copiar link da licitação"
          >
            <Share2 className="size-4" />
          </button>

          {l.url_pncp && (
            <a
              href={l.url_pncp}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-primary cursor-pointer"
              title="Abrir no PNCP"
            >
              <ExternalLink className="size-4" />
            </a>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
                title="Mais opções"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild className="cursor-pointer font-medium">
                <Link to="/licitacoes/$id" params={{ id: l.id }}>
                  <ExternalLink className="mr-2 size-3.5 text-primary" /> Abrir ficha completa
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />

              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Classificar oportunidade
              </div>

              <DropdownMenuItem
                onClick={() => onSetStatus(l.id, "interessante")}
                className={cn(
                  "cursor-pointer text-xs flex items-center justify-between",
                  l.status_interno === "interessante" && "bg-success/10 font-semibold text-success",
                )}
              >
                <span className="flex items-center gap-2">
                  <Star className="size-3.5 fill-success text-success" />
                  <span>Interessante</span>
                </span>
                {l.status_interno === "interessante" && <Check className="size-3.5 text-success" />}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => onSetStatus(l.id, "em_analise")}
                className={cn(
                  "cursor-pointer text-xs flex items-center justify-between",
                  l.status_interno === "em_analise" && "bg-warning/10 font-semibold text-warning",
                )}
              >
                <span className="flex items-center gap-2">
                  <Search className="size-3.5 text-warning" />
                  <span>Em análise</span>
                </span>
                {l.status_interno === "em_analise" && <Check className="size-3.5 text-warning" />}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => onSetStatus(l.id, "descartada")}
                className={cn(
                  "cursor-pointer text-xs flex items-center justify-between",
                  l.status_interno === "descartada" &&
                    "bg-destructive/10 font-semibold text-destructive",
                )}
              >
                <span className="flex items-center gap-2">
                  <XCircle className="size-3.5 text-destructive" />
                  <span>Descartada</span>
                </span>
                {l.status_interno === "descartada" && (
                  <Check className="size-3.5 text-destructive" />
                )}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => onSetStatus(l.id, "proposta_enviada")}
                className={cn(
                  "cursor-pointer text-xs flex items-center justify-between",
                  l.status_interno === "proposta_enviada" &&
                    "bg-primary/10 font-semibold text-primary",
                )}
              >
                <span className="flex items-center gap-2">
                  <Send className="size-3.5 text-primary" />
                  <span>Proposta enviada</span>
                </span>
                {l.status_interno === "proposta_enviada" && (
                  <Check className="size-3.5 text-primary" />
                )}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => onSetStatus(l.id, "nova")}
                className={cn(
                  "cursor-pointer text-xs flex items-center justify-between text-muted-foreground",
                  l.status_interno === "nova" && "bg-muted font-semibold text-foreground",
                )}
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="size-3.5 text-info" />
                  <span>Redefinir como nova</span>
                </span>
                {l.status_interno === "nova" && <Check className="size-3.5 text-info" />}
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={() => onAbrirObs(l.id)} className="cursor-pointer text-xs">
                <MessageSquarePlus className="mr-2 size-3.5 text-muted-foreground" /> Observação
                rápida
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Título */}
      <Link to="/licitacoes/$id" params={{ id: l.id }} className="mt-3 block">
        <h3 className="line-clamp-2 text-sm font-semibold uppercase tracking-tight text-brand transition-colors hover:text-brand/80 sm:text-base">
          {titulo}
        </h3>
      </Link>

      {/* Abas */}
      <Tabs defaultValue="detalhes" className="mt-3 w-full">
        <TabsList className="h-auto w-full justify-start gap-5 rounded-none border-b border-border bg-transparent p-0">
          <TabsTrigger
            value="detalhes"
            className="h-auto shrink-0 rounded-none border-b-2 border-transparent bg-transparent px-0.5 pb-2 text-xs font-medium text-muted-foreground shadow-none data-[state=active]:border-highlight data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:shadow-none"
          >
            Detalhes
          </TabsTrigger>
          <TabsTrigger
            value="arquivos"
            className="h-auto shrink-0 rounded-none border-b-2 border-transparent bg-transparent px-0.5 pb-2 text-xs font-medium text-muted-foreground shadow-none data-[state=active]:border-highlight data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:shadow-none"
          >
            Arquivos
          </TabsTrigger>
          <TabsTrigger
            value="dados"
            className="h-auto shrink-0 rounded-none border-b-2 border-transparent bg-transparent px-0.5 pb-2 text-xs font-medium text-muted-foreground shadow-none data-[state=active]:border-highlight data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:shadow-none"
          >
            Dados adicionais
          </TabsTrigger>
        </TabsList>

        <TabsContent value="detalhes" className="mt-3 space-y-3">
          <div>
            <p
              className="line-clamp-2 text-xs uppercase leading-relaxed text-muted-foreground"
              title={objeto}
            >
              {objeto}
            </p>
            {l.origem_semantica && l.trecho && (
              <p
                className="mt-1.5 line-clamp-2 text-[11px] italic text-muted-foreground/80"
                title={l.trecho}
              >
                “{l.trecho}”
              </p>
            )}
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-3">
            <CampoDetalhe label="Publicação">{dataBR(l.data_publicacao)}</CampoDetalhe>
            <CampoDetalhe label="Modalidade">{l.modalidade ?? "—"}</CampoDetalhe>
            <CampoDetalhe label="Valor total estimado">
              {l.valor_estimado === null ? "Sigiloso" : brl(l.valor_estimado)}
            </CampoDetalhe>

            <CampoDetalhe label="Abertura">
              {dataHoraExtenso(l.data_abertura_proposta)}
            </CampoDetalhe>
            <CampoDetalhe label="Registro de preço">
              {l.srp === null ? "—" : l.srp ? "Sim" : "Não"}
            </CampoDetalhe>
            <CampoDetalhe label="Cidade">
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <span>
                  {l.municipio ?? "—"}/{l.uf ?? "—"}
                </span>
                {l.distancia_km !== undefined && l.distancia_km !== null && (
                  <DistanceBadge distanciaKm={l.distancia_km} />
                )}
              </span>
            </CampoDetalhe>
          </dl>
        </TabsContent>

        <TabsContent value="arquivos" className="mt-3">
          <LicitacaoCardArquivosTab licitacaoId={l.id} />
        </TabsContent>

        <TabsContent value="dados" className="mt-3 space-y-3">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            <CampoDetalhe label="Órgão">{l.orgao}</CampoDetalhe>
            <CampoDetalhe label="CNPJ">{l.cnpj_orgao}</CampoDetalhe>
            <CampoDetalhe label="Unidade">{l.unidade_nome ?? "—"}</CampoDetalhe>
            <CampoDetalhe label="Processo">{l.processo ?? "—"}</CampoDetalhe>
            <CampoDetalhe label="Categoria">{l.categoria}</CampoDetalhe>
            <CampoDetalhe label="Situação">
              {SITUACAO_TEMPORAL_LABEL[l.situacao_temporal] ?? l.situacao_temporal}
            </CampoDetalhe>
          </dl>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-bold text-primary">Status PNCP</span>
            {l.status_pncp ? (
              <StatusPncpBadge status={l.status_pncp} />
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>

          {l.informacao_complementar && (
            <div className="text-xs">
              <p className="font-bold text-primary">Informação complementar</p>
              <p className="mt-1 line-clamp-3 text-muted-foreground">{l.informacao_complementar}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-4 border-t border-border/60 pt-2.5 text-xs">
            {l.url_pncp && (
              <a
                href={l.url_pncp}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
              >
                <ExternalLink className="size-3.5" /> Publicação no PNCP
              </a>
            )}
            {l.link_sistema_origem && (
              <a
                href={l.link_sistema_origem}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
              >
                <ExternalLink className="size-3.5" /> Sistema de origem
              </a>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
