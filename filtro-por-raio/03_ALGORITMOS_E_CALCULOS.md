# 03. Algoritmos e Cálculos de Distância

Este documento contém o código-fonte pronto para produção dos algoritmos de cálculo de distância (Haversine e OSRM) em TypeScript, JavaScript, Python e SQL.

---

## 🧮 1. Algoritmo Haversine (Distância Aérea em Linha Reta)

### Formula Matemática
$$d = 2 R_{\text{terra}} \cdot \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)$$

---

### A. Implementação em TypeScript / JavaScript

```typescript
export interface PontoGeografico {
  lat: number;
  lon: number;
}

/**
 * Calcula a distância em quilômetros entre dois pontos usando a fórmula Haversine.
 * @param p1 Ponto de Origem (lat, lon)
 * @param p2 Ponto de Destino (lat, lon)
 * @returns Distância em km arredondada com 1 casa decimal
 */
export function calcularDistanciaHaversine(p1: PontoGeografico, p2: PontoGeografico): number {
  const R = 6371; // Raio médio da Terra em km
  
  const dLat = toRad(p2.lat - p1.lat);
  const dLon = toRad(p2.lon - p1.lon);
  
  const lat1 = toRad(p1.lat);
  const lat2 = toRad(p2.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  const distanciaKm = R * c;
  return Math.round(distanciaKm * 10) / 10;
}

function toRad(graus: number): number {
  return (graus * Math.PI) / 180;
}

/**
 * Filtra uma lista de itens que estão dentro do raio em km a partir da origem.
 */
export function filtrarPorRaioHaversine<T extends { latitude: number; longitude: number }>(
  itens: T[],
  origem: PontoGeografico,
  raioMaximoKm: number
): (T & { distancia_km: number })[] {
  return itens
    .map((item) => {
      const distancia_km = calcularDistanciaHaversine(origem, {
        lat: item.latitude,
        lon: item.longitude,
      });
      return { ...item, distancia_km };
    })
    .filter((item) => item.distancia_km <= raioMaximoKm)
    .sort((a, b) => a.distancia_km - b.distancia_km);
}
```

---

### B. Implementação em Python

```python
import math

def calcular_distancia_haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calcula a distância em km entre duas coordenadas geográficas.
    """
    R = 6371.0  # Raio da Terra em km
    
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    
    rad_lat1 = math.radians(lat1)
    rad_lat2 = math.radians(lat2)
    
    a = (math.sin(d_lat / 2) ** 2 +
         math.sin(d_lon / 2) ** 2 * math.cos(rad_lat1) * math.cos(rad_lat2))
    
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    distancia_km = R * c
    return round(distancia_km, 1)

def filtrar_por_raio(itens: list, lat_origem: float, lon_origem: float, raio_max_km: float) -> list:
    resultado = []
    for item in itens:
        dist = calcular_distancia_haversine(lat_origem, lon_origem, item['latitude'], item['longitude'])
        if dist <= raio_max_km:
            item_com_dist = item.copy()
            item_com_dist['distancia_km'] = dist
            resultado.append(item_com_dist)
    
    return sorted(resultado, key=lambda x: x['distancia_km'])
```

---

### C. Implementação em SQL / PostgreSQL Function

```sql
-- Função nativa em SQL puro para calcular Haversine em km
CREATE OR REPLACE FUNCTION haversine_km(
  lat1 NUMERIC, lon1 NUMERIC,
  lat2 NUMERIC, lon2 NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
  r NUMERIC := 6371.0;
  dlat NUMERIC := RADIANS(lat2 - lat1);
  dlon NUMERIC := RADIANS(lon2 - lon1);
  a NUMERIC;
  c NUMERIC;
BEGIN
  IF lat1 IS NULL OR lon1 IS NULL OR lat2 IS NULL OR lon2 IS NULL THEN
    RETURN NULL;
  END IF;

  a := SIN(dlat / 2.0)^2 + COS(RADIANS(lat1)) * COS(RADIANS(lat2)) * SIN(dlon / 2.0)^2;
  c := 2.0 * ATAN2(SQRT(a), SQRT(1.0 - a));
  RETURN ROUND((r * c)::NUMERIC, 1);
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

---

## 🚗 2. Algoritmo Rota Rodoviária via OSRM (Distância e Tempo de Viagem de Carro)

Para obter a distância exata de condução e a duração estimada do percurso:

```typescript
export interface RotaRodoviaria {
  distancia_km: number;
  duracao_texto: string; // Ex: "1h 45min"
  duracao_minutos: number;
}

/**
 * Consulta o servidor OSRM público para calcular a rota rodoviária entre dois pontos.
 */
export async function calcularRotaOSRM(
  origem: PontoGeografico,
  destino: PontoGeografico
): Promise<RotaRodoviaria | null> {
  // Nota: OSRM exige longitude primeiro e depois latitude: lon,lat
  const url = `https://router.project-osrm.org/route/v1/driving/${origem.lon},${origem.lat};${destino.lon},${destino.lat}?overview=false`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    if (data.routes && data.routes[0]) {
      const rota = data.routes[0];
      const distancia_km = Math.round((rota.distance / 1000) * 10) / 10;
      
      const segundosTotais = Math.round(rota.duration);
      const horas = Math.floor(segundosTotais / 3600);
      const minutos = Math.round((segundosTotais % 3600) / 60);

      const duracao_texto = horas > 0 
        ? `${horas}h ${minutos.toString().padStart(2, '0')}min`
        : `${minutos} min`;

      return {
        distancia_km,
        duracao_texto,
        duracao_minutos: Math.round(segundosTotais / 60)
      };
    }
  } catch (error) {
    console.error('Falha ao consultar API de rotas OSRM:', error);
  }

  return null;
}
```
