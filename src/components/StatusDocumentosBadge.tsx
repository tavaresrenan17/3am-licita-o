import { CheckCircle2, Download, FileText, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EstadoDocumentos } from "@/lib/dto";

interface StatusDocumentosBadgeProps {
  estado?: EstadoDocumentos | string | null;
  total?: number | null;
  className?: string;
  compacto?: boolean;
}

export function StatusDocumentosBadge({
  estado,
  total = 0,
  className,
  compacto = false,
}: StatusDocumentosBadgeProps) {
  const tot = total ?? 0;

  if (estado === "completo") {
    return (
      <span
        title={tot > 0 ? `${tot} documento(s) baixado(s)` : "Documentos baixados"}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide border",
          "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shadow-xs",
          className,
        )}
      >
        <CheckCircle2 className="size-3 text-emerald-400 shrink-0" />
        <span>Baixado</span>
        {!compacto && tot > 0 && (
          <span className="text-emerald-400/80 font-normal">({tot})</span>
        )}
      </span>
    );
  }

  if (estado === "coletando") {
    return (
      <span
        title="Baixando e extraindo documentos do PNCP"
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border",
          "bg-sky-500/15 text-sky-400 border-sky-500/30 animate-pulse",
          className,
        )}
      >
        <Loader2 className="size-3 animate-spin shrink-0 text-sky-400" />
        <span>Baixando…</span>
      </span>
    );
  }

  if (estado === "erro") {
    return (
      <span
        title="Erro ao baixar ou extrair documentos"
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border",
          "bg-rose-500/15 text-rose-400 border-rose-500/30",
          className,
        )}
      >
        <AlertCircle className="size-3 shrink-0 text-rose-400" />
        <span>Erro</span>
      </span>
    );
  }

  // pendente ou desconhecido
  if (tot === 0) {
    return (
      <span
        title="Nenhum documento anexado no PNCP ainda"
        className={cn("text-muted-foreground/60 text-xs", className)}
      >
        —
      </span>
    );
  }

  return (
    <span
      title={`${tot} documento(s) disponível(is) no PNCP (ainda não baixados)`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-normal border border-border/60 bg-muted/30 text-muted-foreground",
        className,
      )}
    >
      <FileText className="size-2.5 opacity-60" />
      <span>{tot}</span>
    </span>
  );
}
