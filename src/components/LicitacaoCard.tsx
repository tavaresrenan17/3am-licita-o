import { Link } from "@tanstack/react-router";
import {
  CalendarClock,
  ExternalLink,
  FileText,
  MapPin,
  MessageSquarePlus,
  MoreVertical,
  Star,
} from "lucide-react";
import type { LicitacaoDTO } from "@/lib/dto";
import { brl, dataBR, diasRestantes } from "@/lib/format";
import { STATUS_INTERNO_LABEL, type StatusInterno } from "@/lib/types";
import { ScoreBadge, StatusInternoBadge, StatusPncpBadge } from "@/components/data-bits";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function LicitacaoCard({
  licitacao: l,
  onSetStatus,
  onTogglePrioridade,
  onAbrirObs,
  selecionada,
}: {
  licitacao: LicitacaoDTO;
  onSetStatus: (id: string, status: StatusInterno) => void;
  onTogglePrioridade: (id: string, atual: boolean) => void;
  onAbrirObs: (id: string) => void;
  selecionada?: boolean;
}) {
  const dias = l.data_limite_proposta ? diasRestantes(l.data_limite_proposta) : null;
  const objeto =
    l.objeto && l.objeto.trim().toLowerCase() !== "null"
      ? l.objeto
      : "Objeto não informado";

  const urgenciaEstilo =
    dias !== null && dias >= 0 && dias <= 2
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : dias !== null && dias <= 5
        ? "border-warning/40 bg-warning/10 text-warning"
        : dias !== null && dias <= 15
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border/80 bg-muted/60 text-muted-foreground";

  return (
    <div
      className={cn(
        "group relative flex flex-col justify-between rounded-xl border border-border/80 bg-card/90 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:bg-card hover:shadow-lg hover:shadow-black/20",
        selecionada && "border-primary ring-1 ring-primary/50 bg-accent/40",
      )}
    >
      <div>
        {/* Top bar do Card: Status e Ações */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusInternoBadge status={l.status_interno} />
            {l.status_pncp && <StatusPncpBadge status={l.status_pncp} />}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTogglePrioridade(l.id, l.prioridade);
              }}
              className="flex size-7 items-center justify-center rounded-lg border border-border/60 bg-muted/30 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent hover:text-primary cursor-pointer"
              title={l.prioridade ? "Remover prioridade" : "Marcar como prioritária"}
            >
              <Star
                className={cn(
                  "size-3.5",
                  l.prioridade
                    ? "fill-primary text-primary"
                    : "text-muted-foreground",
                )}
              />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
                >
                  <MoreVertical className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to="/licitacoes/$id" params={{ id: l.id }}>
                    Abrir ficha completa
                  </Link>
                </DropdownMenuItem>
                {l.url_pncp && (
                  <DropdownMenuItem asChild>
                    <a href={l.url_pncp} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 size-3.5" /> Ver no PNCP
                    </a>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {(Object.keys(STATUS_INTERNO_LABEL) as StatusInterno[]).map((s) => (
                  <DropdownMenuItem key={s} onClick={() => onSetStatus(l.id, s)}>
                    Marcar como {STATUS_INTERNO_LABEL[s].toLowerCase()}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onAbrirObs(l.id)}>
                  <MessageSquarePlus className="mr-2 size-3.5" /> Observação rápida
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Órgão e Localização */}
        <div className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="size-3.5 shrink-0 text-primary" />
          <span className="truncate font-medium text-foreground/85" title={l.orgao}>
            {l.orgao}
          </span>
          <span className="shrink-0 text-muted-foreground/60">·</span>
          <span className="shrink-0 font-medium">
            {l.municipio ?? "—"}/{l.uf ?? "—"}
          </span>
        </div>

        {/* Objeto */}
        <Link
          to="/licitacoes/$id"
          params={{ id: l.id }}
          className="mt-2 block"
        >
          <p
            className="line-clamp-3 text-sm font-semibold leading-snug tracking-tight text-foreground group-hover:text-primary transition-colors"
            title={objeto}
          >
            {objeto}
          </p>
        </Link>

        {/* Trecho Semântico se existir */}
        {l.origem_semantica && l.trecho && (
          <p
            className="mt-1.5 line-clamp-2 rounded-md bg-muted/40 p-2 text-[11px] italic text-muted-foreground"
            title={l.trecho}
          >
            Edital: “{l.trecho}”
          </p>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-border/60">
        {/* Valores e Prazos */}
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Valor Estimado
            </p>
            <p className="num text-base font-bold tracking-tight text-foreground">
              {brl(l.valor_estimado)}
            </p>
          </div>

          {l.score_aderencia !== undefined && (
            <div className="text-right">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                Aderência Obras
              </p>
              <ScoreBadge score={l.score_aderencia} />
            </div>
          )}
        </div>

        {/* Prazo e Metadados adicionais */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <CalendarClock className="size-3.5 text-muted-foreground shrink-0" />
            <span
              className={cn(
                "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold",
                urgenciaEstilo,
              )}
            >
              {dias === null
                ? "Sem prazo"
                : dias < 0
                  ? "Encerrada"
                  : dias === 0
                    ? "Encerra hoje!"
                    : `Encerra em ${dias}d (${dataBR(l.data_limite_proposta)})`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {l.documentos_total !== undefined && l.documentos_total > 0 && (
              <span
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                title={`${l.documentos_total} documentos anexados`}
              >
                <FileText className="size-3 text-muted-foreground" />
                <span>{l.documentos_total}</span>
              </span>
            )}

            <Button asChild variant="outline" size="sm" className="h-7 px-2.5 text-[11px]">
              <Link to="/licitacoes/$id" params={{ id: l.id }}>
                Ver Detalhe
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
