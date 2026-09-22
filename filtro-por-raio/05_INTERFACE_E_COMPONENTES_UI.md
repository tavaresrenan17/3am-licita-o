# 05. Interface do Usuário e Componentes UI

Este documento especifica os componentes de interface (UI/UX) para controle do filtro por raio e exibição visual das distâncias nos registros da aplicação.

---

## 🎨 Design System e Especificação Visual

O filtro por raio geográfico deve conter 3 elementos fundamentais na interface:

1. **Seletor de Ponto de Referência (Origem)**: Dropdown de cidades pré-mapeadas ou input autocompletar de cidade/UF.
2. **Controle de Raio (Slider/Range)**: Slider interativo de $0\text{ km}$ a $500\text{ km}$ com exibição do valor selecionado em destaque.
3. **Badges de Proximidade nos Cards/Tabelas**: Indicador visual colorido com a distância calculada até o item.

---

## ⚛️ 1. Componente de Filtro por Raio em React (Tailwind CSS / Vanilla CSS)

```tsx
import React, { useState } from 'react';

export interface OrigemOpcao {
  id: string;
  nome: string;
  uf: string;
  lat: number;
  lon: number;
}

interface FiltroRaioProps {
  origensPredefinidas: OrigemOpcao[];
  origemSelecionada: OrigemOpcao;
  raioKm: number;
  onOrigemChange: (origem: OrigemOpcao) => void;
  onRaioChange: (novoRaioKm: number) => void;
  onLimparFiltro: () => void;
}

export const FiltroRaioGeografico: React.FC<FiltroRaioProps> = ({
  origensPredefinidas,
  origemSelecionada,
  raioKm,
  onOrigemChange,
  onRaioChange,
  onLimparFiltro,
}) => {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-xl">📍</span>
          <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
            Filtro por Raio Geográfico
          </h3>
        </div>

        {raioKm > 0 && (
          <button
            onClick={onLimparFiltro}
            className="text-xs font-medium text-red-500 hover:text-red-600 transition-colors"
          >
            Limpar Raio
          </button>
        )}
      </div>

      <div className="mt-4 space-y-4">
        {/* Seletor de Origem */}
        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            Ponto de Referência (Sede / Origem):
          </label>
          <select
            value={origemSelecionada.id}
            onChange={(e) => {
              const encontrada = origensPredefinidas.find((o) => o.id === e.target.value);
              if (encontrada) onOrigemChange(encontrada);
            }}
            className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          >
            {origensPredefinidas.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome} - {item.uf}
              </option>
            ))}
          </select>
        </div>

        {/* Slider de Raio em KM */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Raio de Alcance Máximo:
            </label>
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
              {raioKm === 0 ? 'Sem limite (Nacional)' : `Até ${raioKm} km`}
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={500}
            step={10}
            value={raioKm}
            onChange={(e) => onRaioChange(Number(e.target.value))}
            className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:bg-zinc-700"
          />

          <div className="flex justify-between text-[10px] text-zinc-400 mt-1">
            <span>0 km (Todos)</span>
            <span>100 km</span>
            <span>250 km</span>
            <span>500 km</span>
          </div>
        </div>
      </div>
    </div>
  );
};
```

---

## 🏷️ 2. Componente Badge de Distância (Exibição nos Cards)

```tsx
import React from 'react';

interface DistanceBadgeProps {
  distanciaKm?: number | null;
  cidade?: string;
  uf?: string;
}

export const DistanceBadge: React.FC<DistanceBadgeProps> = ({ distanciaKm, cidade, uf }) => {
  if (distanciaKm === undefined || distanciaKm === null) {
    return null;
  }

  // Cor baseada na proximidade
  let bgClass = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800';
  
  if (distanciaKm > 100 && distanciaKm <= 250) {
    bgClass = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800';
  } else if (distanciaKm > 250) {
    bgClass = 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700';
  }

  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${bgClass}`}>
      <span>🚗</span>
      <span>{distanciaKm} km</span>
      {cidade && <span className="opacity-75 font-normal">({cidade}/{uf})</span>}
    </span>
  );
};
```
