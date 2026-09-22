# 04. Integração com Banco de Dados e Indexação

Este documento aborda a implementação da filtragem por raio diretamente no banco de dados (PostgreSQL, Supabase, MySQL) utilizando SQL puro, PostGIS ou ORMs como Prisma e Drizzle.

---

## 🛢️ 1. Abordagem SQL Puro (PostgreSQL / Supabase)

### Consulta com Função Haversine

Assumindo que a tabela `oportunidades` possui colunas `latitude` e `longitude`:

```sql
SELECT 
  id,
  titulo,
  municipio,
  uf,
  latitude,
  longitude,
  haversine_km(-22.8989, -49.6339, latitude, longitude) AS distancia_km
FROM oportunidades
WHERE 
  latitude IS NOT NULL 
  AND longitude IS NOT NULL
  AND haversine_km(-22.8989, -49.6339, latitude, longitude) <= 150 -- Raio de 150 km
ORDER BY distancia_km ASC;
```

---

## 📍 2. Abordagem de Alta Performance com PostGIS (`ST_DWithin`)

Para bancos de dados com grande volume de dados (> 100.000 registros), o PostGIS oferece suporte a índices espaciais GiST.

### A. Preparação da Tabela no PostGIS

```sql
-- Habilita a extensão de geolocalização no PostgreSQL/Supabase
CREATE EXTENSION IF NOT EXISTS postgis;

-- Adiciona a coluna geométrica (Ponto SRID 4326 - WGS 84)
ALTER TABLE oportunidades 
ADD COLUMN IF NOT EXISTS geom GEOMETRY(Point, 4326);

-- Preenche a coluna geométrica a partir de latitude e longitude existentes
UPDATE oportunidades 
SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Cria índice espacial de alta velocidade (GiST)
CREATE INDEX IF NOT EXISTS idx_oportunidades_geom ON oportunidades USING GIST (geom);
```

### B. Query Espacial com PostGIS (`ST_DWithin` em Metros)

```sql
SELECT 
  id,
  titulo,
  municipio,
  uf,
  -- Distância exata em quilômetros
  ROUND((ST_DistanceSphere(geom, ST_SetSRID(ST_MakePoint(-49.6339, -22.8989), 4326)) / 1000.0)::numeric, 1) AS distancia_km
FROM oportunidades
WHERE ST_DWithin(
  geom::geography,
  ST_SetSRID(ST_MakePoint(-49.6339, -22.8989), 4326)::geography,
  150000 -- Distância limite em METROS (150km = 150.000m)
)
ORDER BY distancia_km ASC;
```

---

## ⚡ 3. Função Supabase RPC (Stored Procedure Reutilizável)

Você pode expor a filtragem por raio diretamente como uma RPC no Supabase para ser chamada pelo cliente via JavaScript/TypeScript SDK:

```sql
CREATE OR REPLACE FUNCTION get_itens_no_raio(
  lat_origem NUMERIC,
  lon_origem NUMERIC,
  raio_km NUMERIC
)
RETURNS TABLE (
  id UUID,
  titulo TEXT,
  municipio TEXT,
  uf TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  distancia_km NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id,
    o.titulo,
    o.municipio,
    o.uf,
    o.latitude,
    o.longitude,
    haversine_km(lat_origem, lon_origem, o.latitude, o.longitude) AS distancia_km
  FROM oportunidades o
  WHERE 
    o.latitude IS NOT NULL 
    AND o.longitude IS NOT NULL
    AND haversine_km(lat_origem, lon_origem, o.latitude, o.longitude) <= raio_km
  ORDER BY distancia_km ASC;
END;
$$ LANGUAGE plpgsql;
```

### Exemplo de Chamada no Frontend (Supabase Client):

```typescript
const { data, error } = await supabase.rpc('get_itens_no_raio', {
  lat_origem: -22.8989,
  lon_origem: -49.6339,
  raio_km: 150
});
```

---

## 🔷 4. Integração com ORMs (Prisma / Drizzle)

### Prisma ORM (Com Raw Query)

```typescript
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export async function buscarNoRaioPrisma(latOrigem: number, lonOrigem: number, raioKm: number) {
  return await prisma.$queryRaw`
    SELECT id, titulo, municipio, uf, latitude, longitude,
           haversine_km(${latOrigem}, ${lonOrigem}, latitude, longitude) as distancia_km
    FROM "Oportunidade"
    WHERE haversine_km(${latOrigem}, ${lonOrigem}, latitude, longitude) <= ${raioKm}
    ORDER BY distancia_km ASC
  `;
}
```

### Drizzle ORM (Com SQL Template)

```typescript
import { sql } from 'drizzle-orm';
import { db } from './db';
import { oportunidades } from './schema';

export async function buscarNoRaioDrizzle(latOrigem: number, lonOrigem: number, raioKm: number) {
  const distanciaSql = sql`haversine_km(${latOrigem}, ${lonOrigem}, ${oportunidades.latitude}, ${oportunidades.longitude})`;
  
  return await db
    .select({
      id: oportunidades.id,
      titulo: oportunidades.titulo,
      distanciaKm: distanciaSql
    })
    .from(oportunidades)
    .where(sql`${distanciaSql} <= ${raioKm}`)
    .orderBy(distanciaSql);
}
```
