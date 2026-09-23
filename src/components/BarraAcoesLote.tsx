import { Check, Download, Library, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BarraAcoesLoteProps {
  selecionadasCount: number;
  onSincronizar: () => void;
  onDesmarcar: () => void;
  onIrParaAlexandria?: () => void;
  isSincronizando?: boolean;
  className?: string;
}

export function BarraAcoesLote({
  selecionadasCount,
  onSincronizar,
  onDesmarcar,
  onIrParaAlexandria,
  isSincronizando = false,
  className,
}: BarraAcoesLoteProps) {
  if (selecionadasCount <= 0) return null;

  return (
    <div
      data-testid="barra-acoes-lote"
      className={cn(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-2xl border border-primary/40 bg-background/95 px-5 py-3 shadow-2xl backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-5",
        "border-border/80 ring-1 ring-border/60",
        className,
      )}
    >
      <div className="flex items-center gap-2 pr-2 border-r border-border/80">
        <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground shadow-xs">
          {selecionadasCount}
        </span>
        <span className="text-xs font-semibold text-foreground whitespace-nowrap">
          {selecionadasCount === 1 ? "licitação selecionada" : "licitações selecionadas"}
        </span>
      </div>

      <Button
        type="button"
        size="sm"
        disabled={isSincronizando}
        onClick={onSincronizar}
        className="h-8 gap-2 px-3.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm cursor-pointer"
      >
        {isSincronizando ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            <span>Sincronizando…</span>
          </>
        ) : (
          <>
            <Download className="size-3.5" />
            <span>Sincronizar & Mover para Alexandria</span>
          </>
        )}
      </Button>

      {onIrParaAlexandria && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isSincronizando}
          onClick={onIrParaAlexandria}
          className="h-8 gap-1.5 px-3 text-xs font-medium cursor-pointer hover:bg-muted"
        >
          <Library className="size-3.5 text-primary" />
          <span>Ver em Alexandria</span>
        </Button>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={isSincronizando}
        onClick={onDesmarcar}
        className="h-8 size-8 p-0 text-muted-foreground hover:text-foreground cursor-pointer rounded-lg"
        title="Desmarcar todas"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
