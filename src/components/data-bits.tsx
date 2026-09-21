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

  const bgIcon =
    destaque === "primary"
      ? "bg-primary/10 border-primary/25"
      : destaque === "warning"
        ? "bg-warning/10 border-warning/25"
        : destaque === "success"
          ? "bg-success/10 border-success/25"
          : destaque === "info"
            ? "bg-info/10 border-info/25"
            : "bg-muted/60 border-border/80";

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border/80 bg-card/90 p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:bg-card hover:shadow-md hover:shadow-black/20">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground/90">
          {label}
        </p>
        {Icon && (
          <div
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-lg border transition-transform duration-200 group-hover:scale-110",
              bgIcon,
            )}
          >
            <Icon className={cn("size-3.5", cor)} />
          </div>
        )}
      </div>
      <p className={cn("num mt-2 whitespace-nowrap text-2xl font-bold tracking-tight", cor)}>
        {valor}
      </p>
      {detalhe && (
        <p className="mt-1 truncate text-[11px] text-muted-foreground transition-colors group-hover:text-foreground/80">
          {detalhe}
        </p>
      )}
    </div>
  );
}

const STATUS_CONFIG: Record<
  StatusInterno,
  { badge: string; dot: string; pulse?: boolean }
> = {
  nova: {
    badge: "border-info/40 bg-info/10 text-info",
    dot: "bg-info",
    pulse: true,
  },
  em_analise: {
    badge: "border-warning/40 bg-warning/10 text-warning",
    dot: "bg-warning",
    pulse: true,
  },
  interessante: {
    badge: "border-success/40 bg-success/10 text-success",
    dot: "bg-success",
  },
  descartada: {
    badge: "border-border/80 bg-muted/60 text-muted-foreground",
    dot: "bg-muted-foreground/60",
  },
  proposta_enviada: {
    badge: "border-primary/40 bg-primary/10 text-primary",
    dot: "bg-primary",
  },
};

export function StatusInternoBadge({ status }: { status: StatusInterno }) {
  const conf = STATUS_CONFIG[status] ?? STATUS_CONFIG.nova;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors",
        conf.badge,
      )}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          conf.dot,
          conf.pulse && "animate-pulse-subtle",
        )}
        aria-hidden="true"
      />
      {STATUS_INTERNO_LABEL[status]}
    </span>
  );
}

export function StatusPncpBadge({ status }: { status: string }) {
  const isRecebendo = status.toLowerCase().includes("receb");
  const isSuspensa = status.toLowerCase().includes("susp") || status.toLowerCase().includes("cancel");

  const tom = isRecebendo
    ? "border-success/40 bg-success/10 text-success"
    : isSuspensa
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : "border-border/80 bg-muted/40 text-muted-foreground";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        tom,
      )}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          isRecebendo
            ? "bg-success animate-pulse-subtle"
            : isSuspensa
              ? "bg-destructive"
              : "bg-muted-foreground/60",
        )}
        aria-hidden="true"
      />
      {status}
    </span>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const corBarra =
    score >= 75
      ? "bg-success shadow-[0_0_8px_rgba(74,222,128,0.5)]"
      : score >= 60
        ? "bg-primary shadow-[0_0_8px_rgba(250,175,50,0.4)]"
        : score >= 40
          ? "bg-warning"
          : "bg-muted-foreground";

  const corTexto =
    score >= 75
      ? "text-success font-semibold"
      : score >= 60
        ? "text-primary font-semibold"
        : score >= 40
          ? "text-warning"
          : "text-muted-foreground";

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/30 px-2 py-0.5"
      title={`Score de Aderência: ${score}%`}
    >
      <div className="h-1.5 w-10 overflow-hidden rounded-full bg-muted/80">
        <div
          className={cn("h-full rounded-full transition-all duration-300", corBarra)}
          style={{ width: `${Math.min(Math.max(score, 0), 100)}%` }}
        />
      </div>
      <span className={cn("num text-[11px] leading-none", corTexto)}>{score}</span>
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
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/80 bg-card/30 px-6 py-14 text-center">
      <div className="flex size-10 items-center justify-center rounded-full border border-border/70 bg-muted/40 text-muted-foreground">
        <span className="text-base font-semibold">?</span>
      </div>
      <p className="text-sm font-semibold tracking-tight text-foreground">{titulo}</p>
      <p className="max-w-md text-xs leading-relaxed text-muted-foreground">{descricao}</p>
      {acao && <div className="mt-1">{acao}</div>}
    </div>
  );
}
