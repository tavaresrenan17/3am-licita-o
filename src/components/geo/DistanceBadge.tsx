import React from "react";
import { Car, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatarDistanciaKm, obterFaixaProximidade } from "@/lib/geo/haversine";

interface DistanceBadgeProps {
  distanciaKm?: number | null;
  cidade?: string | null;
  uf?: string | null;
  className?: string;
  exibirCidade?: boolean;
}

export const DistanceBadge: React.FC<DistanceBadgeProps> = ({
  distanciaKm,
  cidade,
  uf,
  className,
  exibirCidade = false,
}) => {
  if (distanciaKm === undefined || distanciaKm === null || isNaN(distanciaKm)) {
    return null;
  }

  const faixa = obterFaixaProximidade(distanciaKm);
  const textoDistancia = formatarDistanciaKm(distanciaKm);

  // Estilos temáticos refinados por faixa
  const variantes = {
    muito_perto:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/15",
    media:
      "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/15",
    longe:
      "bg-muted/70 text-muted-foreground border-border/60 hover:bg-muted",
    desconhecido: "bg-muted text-muted-foreground border-border/40",
  };

  const badgeClass = variantes[faixa];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-tight transition-colors select-none",
        badgeClass,
        className,
      )}
      title={`Distância em linha reta até a origem selecionada: ${textoDistancia}${
        cidade ? ` (${cidade}/${uf})` : ""
      }`}
    >
      <Car className="size-3 shrink-0 opacity-85" />
      <span>{textoDistancia}</span>
      {exibirCidade && cidade && (
        <span className="opacity-70 font-normal truncate max-w-[120px]">
          ({cidade}/{uf})
        </span>
      )}
    </span>
  );
};
