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
          "bg-success/12 text-success border-success/30 shadow-xs",
          className,
        )}
      >
        <CheckCircle2 className="size-3 text-success shrink-0" />
        <span>Baixado</span>
        {!compacto && tot > 0 && (
          <span className="text-success/80 font-normal">({tot})</span>
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
          "bg-info/12 text-info border-info/30 animate-pulse",
          className,
        )}
      >
        <Loader2 className="size-3 animate-spin shrink-0 text-info" />
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
          "bg-destructive/10 text-destructive border-destructive/30",
          className,
        )}
      >
        <AlertCircle className="size-3 shrink-0 text-destructive" />
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
