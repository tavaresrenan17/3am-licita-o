import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_INTERNO_LABEL, type StatusInterno } from "@/lib/types";

export function MetricCard({
  label,
  valor,
  detalhe,
  icon: Icon,
  destaque,
}: {
  label: string;
  valor: string | number;
  detalhe?: string;
  icon?: LucideIcon;
  destaque?: "primary" | "warning" | "success" | "info";
}) {
  const cor =
    destaque === "primary"
      ? "text-primary"
      : destaque === "warning"
        ? "text-warning"
        : destaque === "success"
          ? "text-success"
          : destaque === "info"
            ? "text-info"
            : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {Icon && <Icon className={cn("size-4 shrink-0", cor)} />}
      </div>
      <p className={cn("num mt-1.5 whitespace-nowrap text-xl font-semibold tracking-tight", cor)}>
        {valor}
      </p>
      {detalhe && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{detalhe}</p>}
    </div>
  );
}

const STATUS_CLASSES: Record<StatusInterno, string> = {
  nova: "border-info/40 bg-info/10 text-info",
  em_analise: "border-warning/40 bg-warning/10 text-warning",
  interessante: "border-success/40 bg-success/10 text-success",
  descartada: "border-border bg-muted text-muted-foreground",
  proposta_enviada: "border-primary/40 bg-primary/10 text-primary",
};

export function StatusInternoBadge({ status }: { status: StatusInterno }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        STATUS_CLASSES[status],
      )}
    >
      {STATUS_INTERNO_LABEL[status]}
    </span>
  );
}

export function StatusPncpBadge({ status }: { status: string }) {
  const tom = status.toLowerCase().includes("receb")
    ? "border-success/40 text-success"
    : status.toLowerCase().includes("susp")
      ? "border-destructive/40 text-destructive"
      : "border-border text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
        tom,
      )}
    >
      {status}
    </span>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const cor =
    score >= 75
      ? "bg-success"
      : score >= 60
        ? "bg-primary"
        : score >= 40
          ? "bg-warning"
          : "bg-muted-foreground";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", cor)} style={{ width: `${score}%` }} />
      </div>
      <span className="num text-xs text-muted-foreground">{score}</span>
    </div>
  );
}

export function EmptyState({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/40 px-6 py-14 text-center">
      <p className="text-sm font-medium">{titulo}</p>
      <p className="max-w-md text-xs text-muted-foreground">{descricao}</p>
      {acao}
    </div>
  );
}
