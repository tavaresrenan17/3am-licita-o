import { Moon, Sun, Monitor, Check } from "lucide-react";
import { useTheme, type Theme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Botão de alternância rápida 1-clique (Claro <-> Escuro) ou com dropdown.
 */
export function ThemeToggle({
  className,
  align = "end",
  mode = "toggle",
}: {
  className?: string;
  align?: "start" | "center" | "end";
  mode?: "toggle" | "dropdown";
}) {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();

  // Modo 1-clique direto: ao clicar, altera na hora entre Claro e Escuro
  if (mode === "toggle") {
    const isDark = resolvedTheme === "dark";
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => toggleTheme()}
        className={cn(
          "relative size-8 shrink-0 rounded-lg border-border bg-muted/50 text-muted-foreground transition-all duration-150 hover:border-primary/40 hover:bg-accent hover:text-foreground cursor-pointer shadow-xs",
          isDark ? "hover:text-primary" : "hover:text-amber-500",
          className,
        )}
        title={
          isDark
            ? "Modo Escuro ativo (Clique para alternar para Modo Claro)"
            : "Modo Claro ativo (Clique para alternar para Modo Escuro)"
        }
        aria-label="Alternar entre modo claro e escuro"
      >
        {isDark ? (
          <Moon className="size-3.5 text-primary transition-transform duration-200 hover:rotate-12" />
        ) : (
          <Sun className="size-3.5 text-amber-500 transition-transform duration-200 hover:rotate-45" />
        )}
      </Button>
    );
  }

  // Modo Dropdown com suporte garantido a onSelect e onClick
  const handleSelect = (next: Theme) => {
    setTheme(next);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn(
            "relative size-8 shrink-0 rounded-lg border-border bg-muted/50 text-muted-foreground transition-all duration-150 hover:border-primary/40 hover:bg-accent hover:text-foreground cursor-pointer shadow-xs",
            className,
          )}
          title={`Tema: ${theme === "system" ? "Sistema (" + (resolvedTheme === "dark" ? "Escuro" : "Claro") + ")" : theme === "dark" ? "Modo Escuro" : "Modo Claro"}`}
          aria-label="Selecionar tema de cores"
        >
          {theme === "system" ? (
            <Monitor className="size-3.5 transition-transform duration-200" />
          ) : resolvedTheme === "dark" ? (
            <Moon className="size-3.5 text-primary transition-transform duration-200" />
          ) : (
            <Sun className="size-3.5 text-amber-500 transition-transform duration-200" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-36 p-1 text-xs">
        <DropdownMenuItem
          onSelect={() => handleSelect("light")}
          onClick={() => handleSelect("light")}
          className="flex items-center justify-between gap-2 px-2.5 py-1.5 cursor-pointer font-medium"
        >
          <div className="flex items-center gap-2">
            <Sun className="size-3.5 text-amber-500" />
            <span>Modo Claro</span>
          </div>
          {theme === "light" && <Check className="size-3.5 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => handleSelect("dark")}
          onClick={() => handleSelect("dark")}
          className="flex items-center justify-between gap-2 px-2.5 py-1.5 cursor-pointer font-medium"
        >
          <div className="flex items-center gap-2">
            <Moon className="size-3.5 text-primary" />
            <span>Modo Escuro</span>
          </div>
          {theme === "dark" && <Check className="size-3.5 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => handleSelect("system")}
          onClick={() => handleSelect("system")}
          className="flex items-center justify-between gap-2 px-2.5 py-1.5 cursor-pointer font-medium"
        >
          <div className="flex items-center gap-2">
            <Monitor className="size-3.5 text-muted-foreground" />
            <span>Automático</span>
          </div>
          {theme === "system" && <Check className="size-3.5 text-primary" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Seletor segmentado de tema (Claro / Escuro / Auto) com cliques diretos
 */
export function ThemeSegmentedControl({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className={cn(
        "flex items-center rounded-lg border border-sidebar-border bg-sidebar-accent/30 p-0.5 text-xs text-sidebar-foreground/70",
        className,
      )}
      role="group"
      aria-label="Controle de Tema de Cores"
    >
      <button
        type="button"
        onClick={() => setTheme("light")}
        className={cn(
          "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-all cursor-pointer",
          theme === "light"
            ? "bg-card text-foreground shadow-xs"
            : "hover:text-sidebar-foreground text-sidebar-foreground/60",
        )}
        title="Ativar Modo Claro"
      >
        <Sun className="size-3 text-amber-500" />
        <span>Claro</span>
      </button>

      <button
        type="button"
        onClick={() => setTheme("dark")}
        className={cn(
          "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-all cursor-pointer",
          theme === "dark"
            ? "bg-card text-foreground shadow-xs"
            : "hover:text-sidebar-foreground text-sidebar-foreground/60",
        )}
        title="Ativar Modo Escuro"
      >
        <Moon className="size-3 text-primary" />
        <span>Escuro</span>
      </button>

      <button
        type="button"
        onClick={() => setTheme("system")}
        className={cn(
          "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-all cursor-pointer",
          theme === "system"
            ? "bg-card text-foreground shadow-xs"
            : "hover:text-sidebar-foreground text-sidebar-foreground/60",
        )}
        title="Usar Tema do Sistema"
      >
        <Monitor className="size-3 text-muted-foreground" />
        <span>Auto</span>
      </button>
    </div>
  );
}
