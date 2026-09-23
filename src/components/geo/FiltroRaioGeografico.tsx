import React from "react";
import { Compass, MapPin, Navigation, RotateCcw, Zap } from "lucide-react";
import { ORIGENS_PREDEFINIDAS } from "@/lib/geo/cidades";
import type { OrigemOpcao } from "@/lib/geo/tipos";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface FiltroRaioGeograficoProps {
  origensPredefinidas?: OrigemOpcao[];
  origemSelecionada: OrigemOpcao;
  raioKm: number;
  onOrigemChange: (origem: OrigemOpcao) => void;
  onRaioChange: (novoRaioKm: number) => void;
  onLimparFiltro: () => void;
  totalNoAlcance?: number | undefined;
  className?: string;
}

const PRESETS_KM = [50, 100, 150, 250, 500];

export const FiltroRaioGeografico: React.FC<FiltroRaioGeograficoProps> = ({
  origensPredefinidas = ORIGENS_PREDEFINIDAS,
  origemSelecionada,
  raioKm,
  onOrigemChange,
  onRaioChange,
  onLimparFiltro,
  totalNoAlcance,
  className,
}) => {
  const raioAtivo = raioKm > 0;
  // O raio agora é consulta ao banco. Arrastar mostra o valor na hora, mas só
  // soltar o controle dispara a busca — senão cada passo de 10 km viraria uma
  // requisição.
  const [raioArrastando, setRaioArrastando] = React.useState<number | null>(null);
  const raioExibido = raioArrastando ?? raioKm;

  return (
    <div
      className={cn(
        "rounded-xl border border-border/80 bg-card/75 backdrop-blur-md p-4 shadow-sm transition-all",
        raioAtivo && "border-primary/40 ring-1 ring-primary/20",
        className,
      )}
    >
      {/* Cabeçalho com Ícone e Ação de Limpar */}
      <div className="flex items-center justify-between border-b border-border/50 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Compass className="size-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-foreground tracking-tight flex items-center gap-1.5">
              Filtro por Raio Geográfico
              {raioAtivo && (
                <span className="inline-flex items-center rounded-full bg-primary/15 px-2 py-0.2 text-[10px] font-bold text-primary">
                  Ativo
                </span>
              )}
            </h4>
            <p className="text-[11px] text-muted-foreground">
              Filtre oportunidades pela distância em linha reta da sua sede ou filial.
            </p>
          </div>
        </div>

        {raioAtivo && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onLimparFiltro}
            className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <RotateCcw className="mr-1 size-3" />
            Limpar Raio
          </Button>
        )}
      </div>

      <div className="mt-3.5 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-12 items-end">
        {/* Seletor de Ponto de Referência (Sede / Origem) */}
        <div className="space-y-1.5 sm:col-span-1 lg:col-span-4">
          <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
            <MapPin className="size-3 text-primary" />
            Ponto de Referência / Sede:
          </Label>
          <Select
            value={origemSelecionada.id}
            onValueChange={(id) => {
              const encontrada = origensPredefinidas.find((o) => o.id === id);
              if (encontrada) onOrigemChange(encontrada);
            }}
          >
            <SelectTrigger className="h-8.5 text-xs bg-background">
              <SelectValue placeholder="Selecione a sede de referência" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {origensPredefinidas.map((item) => (
                <SelectItem key={item.id} value={item.id} className="text-xs">
                  <div className="flex items-center justify-between w-full gap-2">
                    <span className="font-medium">
                      {item.nome} - {item.uf}
                    </span>
                    {item.descricao && (
                      <span className="text-[10px] text-muted-foreground">
                        ({item.descricao})
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Controle Slider de Raio em KM */}
        <div className="space-y-2 sm:col-span-1 lg:col-span-5">
          <div className="flex justify-between items-center">
            <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
              <Navigation className="size-3 text-primary" />
              Raio de Alcance Máximo:
            </Label>
            <span
              className={cn(
                "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold transition-all",
                raioAtivo
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {raioExibido === 0 ? "Sem limite (Nacional)" : `Até ${raioExibido} km`}
            </span>
          </div>

          <Slider
            min={0}
            max={500}
            step={10}
            value={[raioExibido]}
            onValueChange={(val) => setRaioArrastando(val[0] ?? 0)}
            onValueCommit={(val) => {
              setRaioArrastando(null);
              onRaioChange(val[0] ?? 0);
            }}
            className="py-1 cursor-pointer"
          />

          <div className="flex justify-between text-[10px] text-muted-foreground/75 px-0.5">
            <span>0 km (Sem limite)</span>
            <span>150 km</span>
            <span>300 km</span>
            <span>500 km</span>
          </div>
        </div>

        {/* Presets Rápidos de 1 Clique */}
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
          <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
            <Zap className="size-3 text-warning" />
            Atalhos de Raio:
          </Label>
          <div className="flex flex-wrap items-center gap-1">
            {PRESETS_KM.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onRaioChange(preset)}
                className={cn(
                  "rounded-md border px-2 py-1 text-[11px] font-medium transition-all cursor-pointer",
                  raioKm === preset
                    ? "border-primary bg-primary/15 text-primary font-semibold"
                    : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {preset}km
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Resumo do Alcance Ativo */}
      {raioAtivo && (
        <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
          <span>
            Buscando licitações em até <strong>{raioKm} km</strong> de{" "}
            <strong>
              {origemSelecionada.nome}/{origemSelecionada.uf}
            </strong>
            .
          </span>
          {totalNoAlcance !== undefined && (
            <span className="font-semibold text-foreground">
              {totalNoAlcance} {totalNoAlcance === 1 ? "oportunidade" : "oportunidades"} no raio
            </span>
          )}
        </div>
      )}
    </div>
  );
};
