import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CalendarClock,
  CircleDollarSign,
  HardHat,
  Keyboard,
  LayoutDashboard,
  Library,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Table2,
  Moon,
  Sun,
  Monitor,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { diaBR } from "@/lib/format";
import { useTheme } from "@/lib/theme";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();

  const aberto = open !== undefined ? open : isOpen;
  const setAberto = onOpenChange || setIsOpen;

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setAberto(!aberto);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [aberto, setAberto]);

  const irPara = (rota: string, search?: Record<string, unknown>) => {
    setAberto(false);
    void navigate({ to: rota as never, search: search as never });
  };

  return (
    <CommandDialog open={aberto} onOpenChange={setAberto}>
      <CommandInput placeholder="O que você deseja buscar ou fazer? (ex: dashboard, obras, sync)..." />
      <CommandList className="max-h-[380px]">
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>

        <CommandGroup heading="Navegação do Sistema">
          <CommandItem onSelect={() => irPara("/")}>
            <LayoutDashboard className="mr-2.5 size-4 text-primary" />
            <span>Dashboard Geral</span>
            <CommandShortcut>G D</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => irPara("/licitacoes")}>
            <Table2 className="mr-2.5 size-4 text-primary" />
            <span>Catálogo de Licitações</span>
            <CommandShortcut>G L</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => irPara("/minhas-licitacoes")}>
            <Library className="mr-2.5 size-4 text-primary" />
            <span>Minhas Licitações — Acervo & Análise</span>
            <CommandShortcut>G M</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => irPara("/sincronizacao")}>
            <RefreshCw className="mr-2.5 size-4 text-primary" />
            <span>Sincronização com PNCP</span>
            <CommandShortcut>G S</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Filtros Rápidos de Construção Civil">
          <CommandItem
            onSelect={() =>
              irPara("/licitacoes", {
                recomendadas: true,
                apenas_abertas: true,
                ordenar: "score_aderencia",
                direcao: "desc",
              })
            }
          >
            <HardHat className="mr-2.5 size-4 text-success" />
            <span>Alta Aderência — Obras de Construção Civil</span>
          </CommandItem>

          <CommandItem
            onSelect={() =>
              irPara("/licitacoes", {
                apenas_abertas: true,
                limite_ate: diaBR(3),
                ordenar: "data_limite_proposta",
                direcao: "asc",
              })
            }
          >
            <CalendarClock className="mr-2.5 size-4 text-warning" />
            <span>Prazos Críticos (Encerram em até 3 dias)</span>
          </CommandItem>

          <CommandItem
            onSelect={() =>
              irPara("/licitacoes", {
                apenas_abertas: true,
                valor_min: "1000000",
                ordenar: "valor_estimado",
                direcao: "desc",
              })
            }
          >
            <CircleDollarSign className="mr-2.5 size-4 text-primary" />
            <span>Grandes Obras (Estimadas acima de R$ 1 milhão)</span>
          </CommandItem>

          <CommandItem
            onSelect={() =>
              irPara("/licitacoes", {
                prioridade: "true",
                apenas_abertas: true,
              })
            }
          >
            <Star className="mr-2.5 size-4 text-primary fill-primary" />
            <span>Licitações Prioritárias</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Ações e Atalhos">
          <CommandItem
            onSelect={() => {
              setAberto(false);
              const ev = new CustomEvent("abrir-atalhos-teclado");
              window.dispatchEvent(ev);
            }}
          >
            <Keyboard className="mr-2.5 size-4 text-muted-foreground" />
            <span>Ver Atalhos de Triagem Rápida</span>
            <CommandShortcut>?</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Aparência e Tema">
          <CommandItem
            onSelect={() => {
              toggleTheme();
              setAberto(false);
            }}
          >
            {resolvedTheme === "dark" ? (
              <Sun className="mr-2.5 size-4 text-amber-500" />
            ) : (
              <Moon className="mr-2.5 size-4 text-primary" />
            )}
            <span>Alternar Tema (Atual: {theme === "system" ? "Automático" : theme === "dark" ? "Escuro" : "Claro"})</span>
          </CommandItem>

          <CommandItem
            onSelect={() => {
              setTheme("light");
              setAberto(false);
            }}
          >
            <Sun className="mr-2.5 size-4 text-amber-500" />
            <span>Modo Claro</span>
          </CommandItem>

          <CommandItem
            onSelect={() => {
              setTheme("dark");
              setAberto(false);
            }}
          >
            <Moon className="mr-2.5 size-4 text-primary" />
            <span>Modo Escuro</span>
          </CommandItem>

          <CommandItem
            onSelect={() => {
              setTheme("system");
              setAberto(false);
            }}
          >
            <Monitor className="mr-2.5 size-4 text-muted-foreground" />
            <span>Tema do Sistema (Automático)</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
