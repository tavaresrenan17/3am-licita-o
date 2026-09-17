import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  RefreshCw,
  Table2,
  Settings,
  HardHat,
  PanelLeft,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useMetricas } from "@/services/api";
import { dataHoraBR, numero } from "@/lib/format";
import { Button } from "@/components/ui/button";

const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/sincronizacao", label: "Sincronização PNCP", icon: RefreshCw },
  { to: "/licitacoes", label: "Licitações", icon: Table2 },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

export function AppShell({
  titulo,
  descricao,
  acoes,
  children,
}: {
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-5 py-3.5 backdrop-blur">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight">{titulo}</h1>
            {descricao && (
              <p className="truncate text-xs text-muted-foreground">{descricao}</p>
            )}
          </div>
          <div className="flex items-center gap-2">{acoes}</div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 md:hidden">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent"
            >
              <Icon className="size-3.5" />
              {label}
            </Link>
          ))}
        </nav>

        <main className="flex-1 p-4 lg:p-5">{children}</main>
      </div>
    </div>
  );
}

function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Uma consulta só, compartilhada em cache com o Dashboard.
  const { data: metricas } = useMetricas();
  const [recolhida, setRecolhida] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("3am-sidebar-recolhida") === "true";
  });

  const toggle = () => {
    setRecolhida((v) => {
      const next = !v;
      window.localStorage.setItem("3am-sidebar-recolhida", String(next));
      return next;
    });
  };

  const sync = metricas?.ultima_sync ?? null;

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200 md:flex",
        recolhida ? "w-16" : "w-60",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2.5 border-b border-sidebar-border px-3 py-3",
          recolhida && "justify-center",
        )}
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <HardHat className="size-5" />
        </div>
        {!recolhida && (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
              3AM LICITAÇÃO
            </p>
            <p className="text-[11px] text-muted-foreground">Construção civil</p>
          </div>
        )}
      </div>

      <div className={cn("px-2 py-2", recolhida && "flex flex-col items-center")}>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          className={cn(
            "mb-2 h-8 w-full text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            recolhida && "w-8",
          )}
          aria-label={recolhida ? "Expandir sidebar" : "Recolher sidebar"}
          title={recolhida ? "Expandir sidebar" : "Recolher sidebar"}
        >
          <PanelLeft className={cn("size-4", recolhida && "rotate-180")} />
          {!recolhida && <span className="ml-2 text-xs">Recolher</span>}
        </Button>
      </div>

      <nav className="flex flex-col gap-0.5 px-2 py-2">
        {NAV.map(({ to, label, icon: Icon }) => {
          const ativo = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                recolhida && "justify-center px-2",
                ativo
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
              title={label}
            >
              <Icon className={cn("size-4 shrink-0", ativo && "text-primary")} />
              {!recolhida && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {!recolhida && (
        <div className="mt-auto space-y-2 border-t border-sidebar-border px-4 py-4 text-[11px] text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Licitações no banco</span>
            <span className="num font-semibold text-sidebar-foreground">
              {metricas ? numero(metricas.total) : "—"}
            </span>
          </div>
          <div>
            <p>Última sincronização</p>
            <p className="num text-sidebar-foreground">
              {sync?.status === "em_andamento"
                ? "em andamento…"
                : dataHoraBR(sync?.finalizado_em ?? null)}
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}
