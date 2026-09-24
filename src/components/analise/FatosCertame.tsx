/**
 * Fatos do certame que o sistema calculou a partir do PNCP (situação da
 * compra, prazo e itens) e os alertas do sistema. Nada aqui vem da IA.
 */
import { AlertTriangle, Info, Package } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { brl, numero } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FatosPncp, SituacaoCertame } from "@/services/analise/fatos";

const SITUACAO: Record<Exclude<SituacaoCertame, "aberto">, { titulo: string; grave: boolean }> = {
  revogado: { titulo: "Contratação revogada", grave: true },
  anulado: { titulo: "Contratação anulada", grave: true },
  homologado: { titulo: "Certame já homologado", grave: true },
  proposta_encerrada: { titulo: "Prazo de propostas encerrado", grave: true },
  suspenso: { titulo: "Contratação suspensa", grave: false },
  indeterminado: { titulo: "Prazo de propostas não informado", grave: false },
};

export function FatosCertame({
  fatos,
  alertasSistema,
}: {
  fatos: FatosPncp | null;
  alertasSistema: readonly string[];
}) {
  const situacao =
    fatos && fatos.situacaoCertame !== "aberto" ? SITUACAO[fatos.situacaoCertame] : null;

  return (
    <div className="space-y-3">
      {fatos && situacao && (
        <Alert
          className={cn(
            situacao.grave
              ? "border-destructive/40 bg-destructive/10"
              : "border-warning/40 bg-warning/10",
          )}
        >
          <AlertTriangle
            className={cn("h-4 w-4", situacao.grave ? "text-destructive" : "text-warning")}
          />
          <AlertTitle className="text-xs font-semibold text-foreground">
            {situacao.titulo}
          </AlertTitle>
          <AlertDescription className="text-xs text-foreground/90">
            {fatos.motivoSituacao}
          </AlertDescription>
        </Alert>
      )}

      {fatos?.itensDisponiveis && fatos.totalItens > 0 && (
        <div className="rounded-xl border border-border/70 bg-card p-3.5 space-y-2">
          <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <Package className="h-4 w-4 text-primary" /> Itens no PNCP
          </p>
          <dl className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <dt className="text-muted-foreground">Itens</dt>
              <dd className="font-semibold text-foreground">{numero(fatos.totalItens)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Valor total</dt>
              <dd className="font-semibold text-foreground">{brl(fatos.valorTotalItens)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Exclusivos/cota ME/EPP</dt>
              <dd className="font-semibold text-foreground">{numero(fatos.itensMeEpp)}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(fatos.situacoesItens).map(([nome, quantidade]) => (
              <Badge key={nome} variant="outline" className="text-[10px] font-normal">
                {nome}: {numero(quantidade)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {alertasSistema.length > 0 && (
        <ul className="space-y-1">
          {alertasSistema.map((alerta) => (
            <li key={alerta} className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{alerta}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
