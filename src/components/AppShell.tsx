import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  RefreshCw,
  Table2,
  HardHat,
  PanelLeft,
  ArrowLeft,
  Search,
  Keyboard,
  Library,
  type LucideIcon,
} from "lucide-react";
import { useState, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useMetricas } from "@/services/api";
import { dataHoraBR, numero } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/components/CommandPalette";
import { AtalhosModal } from "@/components/AtalhosModal";

const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/licitacoes", label: "Licitações", icon: Table2 },
  { to: "/alexandria", label: "Alexandria", icon: Library },
  { to: "/sincronizacao", label: "Sincronização PNCP", icon: RefreshCw },
];

export function AppShell({
  titulo,
  descricao,
  acoes,
  mostrarVoltar,
  voltarPara,
  children,
}: {
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
  mostrarVoltar?: boolean;
  voltarPara?: string;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [atalhosOpen, setAtalhosOpen] = useState(false);

  // Listener para tecla '?'
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setAtalhosOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Exibe o botão de voltar automaticamente em qualquer página que não seja a Home (/)
  const deveMostrarVoltar = mostrarVoltar ?? pathname !== "/";

  const handleVoltar = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else if (voltarPara) {
      router.navigate({ to: voltarPara });
    } else {
      router.navigate({ to: "/" });
    }
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary">
      <Sidebar onOpenPalette={() => setPaletteOpen(true)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-background/85 px-5 py-2.5 backdrop-blur-md">
          <div className="flex items-center gap-2.5 min-w-0">
            {deveMostrarVoltar && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8 shrink-0 rounded-lg border-border/80 bg-card/60 hover:bg-accent hover:text-foreground text-muted-foreground shadow-xs cursor-pointer"
                onClick={handleVoltar}
                title="Voltar para a página anterior"
                aria-label="Voltar para a página anterior"
              >
                <ArrowLeft className="size-4" />
              </Button>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-base font-semibold tracking-tight">{titulo}</h1>
                <div className="hidden xl:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse-subtle" />
                  <span>PNCP Integrado</span>
                </div>
              </div>
              {descricao && (
                <p className="truncate text-xs text-muted-foreground">{descricao}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="hidden sm:inline-flex items-center gap-2 rounded-lg border border-border/80 bg-card/60 px-2.5 py-1.5 text-xs text-muted-foreground transition-all duration-150 hover:border-primary/40 hover:bg-accent hover:text-foreground cursor-pointer"
              title="Abrir Command Palette (Ctrl+K)"
            >
              <Search className="size-3.5 text-muted-foreground" />
              <span>Buscar comandos...</span>
              <kbd className="rounded border border-border/80 bg-muted/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                Ctrl K
              </kbd>
            </button>

            <button
              type="button"
              onClick={() => setAtalhosOpen(true)}
              className="inline-flex size-8 items-center justify-center rounded-lg border border-border/80 bg-card/60 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground cursor-pointer"
              title="Ver atalhos de teclado (?)"
              aria-label="Atalhos de teclado"
            >
              <Keyboard className="size-3.5" />
            </button>

            {acoes}
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-border/80 px-3 py-2 md:hidden bg-card/40">
          {NAV.map(({ to, label, icon: Icon }) => {
            const ativo = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                  ativo
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent/60",
                )}
              >
                <Icon className={cn("size-3.5", ativo && "text-primary")} />
                {label}
              </Link>
            );
          })}
        </nav>

        <main className="flex-1 p-4 lg:p-5">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <AtalhosModal open={atalhosOpen} onOpenChange={setAtalhosOpen} />
    </div>
  );
}

function Sidebar({ onOpenPalette }: { onOpenPalette: () => void }) {
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
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border/80 bg-sidebar transition-all duration-200 md:flex",
        recolhida ? "w-16" : "w-60",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2.5 border-b border-sidebar-border/80 px-3.5 py-3",
          recolhida && "justify-center px-2",
        )}
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/20">
          <HardHat className="size-5" />
        </div>
        {!recolhida && (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-bold tracking-tight text-sidebar-foreground">
              3AM LICITAÇÃO
            </p>
            <p className="text-[11px] font-medium text-primary">Construção civil</p>
          </div>
        )}
      </div>

      <div className={cn("px-2 py-2", recolhida && "flex flex-col items-center")}>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          className={cn(
            "mb-1 h-8 w-full text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            recolhida && "w-8",
          )}
          aria-label={recolhida ? "Expandir sidebar" : "Recolher sidebar"}
          title={recolhida ? "Expandir sidebar" : "Recolher sidebar"}
        >
          <PanelLeft className={cn("size-4", recolhida && "rotate-180")} />
          {!recolhida && <span className="ml-2 text-xs">Recolher</span>}
        </Button>
      </div>

      <nav className="flex flex-col gap-1 px-2 py-1">
        {NAV.map(({ to, label, icon: Icon }) => {
          const ativo = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-150",
                recolhida && "justify-center px-2",
                ativo
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
              )}
              title={label}
            >
              {ativo && (
                <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
              )}
              <Icon
                className={cn(
                  "size-4 shrink-0 transition-colors",
                  ativo ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                )}
              />
              {!recolhida && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {!recolhida && (
        <div className="mt-auto space-y-2.5 border-t border-sidebar-border/80 px-4 py-4 text-[11px] text-muted-foreground">
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
