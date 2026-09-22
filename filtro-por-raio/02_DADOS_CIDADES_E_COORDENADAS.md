# 02. Dados de Cidades, Coordenadas e Geocodificação

Este documento fornece o mapeamento de coordenadas geográficas de cidades brasileiras, códigos IBGE e as integrações com APIs abertas para buscar coordenadas dinamicamente caso a cidade não esteja no mapeamento prévio.

---

## 📍 Mapeamento Prévio de Cidades Frequentes (Coordenadas & IBGE)

Abaixo está um dicionário de cidades pré-mapeadas pronto para ser incluído no código da aplicação (`cidades-coordenadas.json` ou arquivo TypeScript/JavaScript/Python):

```json
{
  "3550308": { "nome": "São Paulo", "uf": "SP", "lat": -23.5505, "lon": -46.6333 },
  "3549805": { "nome": "Santa Cruz do Rio Pardo", "uf": "SP", "lat": -22.8989, "lon": -49.6339 },
  "3536505": { "nome": "Ourinhos", "uf": "SP", "lat": -22.9786, "lon": -49.8706 },
  "3506003": { "nome": "Bauru", "uf": "SP", "lat": -22.3147, "lon": -49.0606 },
  "3529005": { "nome": "Marília", "uf": "SP", "lat": -22.2139, "lon": -49.9458 },
  "3541406": { "nome": "Presidente Prudente", "uf": "SP", "lat": -22.1256, "lon": -51.3889 },
  "3503208": { "nome": "Araraquara", "uf": "SP", "lat": -21.7946, "lon": -48.1766 },
  "3548906": { "nome": "São Carlos", "uf": "SP", "lat": -22.0175, "lon": -47.8908 },
  "3543402": { "nome": "Ribeirão Preto", "uf": "SP", "lat": -21.1704, "lon": -47.8103 },
  "3549904": { "nome": "São José do Rio Preto", "uf": "SP", "lat": -20.8113, "lon": -49.3758 },
  "3509502": { "nome": "Campinas", "uf": "SP", "lat": -22.9056, "lon": -47.0608 },
  "3552205": { "nome": "Sorocaba", "uf": "SP", "lat": -23.5015, "lon": -47.4581 },
  "3549904": { "nome": "São José dos Campos", "uf": "SP", "lat": -23.1896, "lon": -45.8841 },
  "3526902": { "nome": "Limeira", "uf": "SP", "lat": -22.5647, "lon": -47.4017 },
  "3538709": { "nome": "Piracicaba", "uf": "SP", "lat": -22.7253, "lon": -47.6492 },
  "3504008": { "nome": "Assis", "uf": "SP", "lat": -22.6606, "lon": -50.4183 },
  "3500605": { "nome": "Águas de Lindóia", "uf": "SP", "lat": -22.4764, "lon": -46.6328 },
  "3304557": { "nome": "Rio de Janeiro", "uf": "RJ", "lat": -22.9068, "lon": -43.1729 },
  "3106200": { "nome": "Belo Horizonte", "uf": "MG", "lat": -19.9167, "lon": -43.9345 },
  "4106902": { "nome": "Curitiba", "uf": "PR", "lat": -25.4284, "lon": -49.2733 },
  "4113700": { "nome": "Londrina", "uf": "PR", "lat": -23.3045, "lon": -51.1696 },
  "4115200": { "nome": "Maringá", "uf": "PR", "lat": -23.4209, "lon": -51.9331 },
  "5300108": { "nome": "Brasília", "uf": "DF", "lat": -15.7975, "lon": -47.8919 },
  "5208707": { "nome": "Goiânia", "uf": "GO", "lat": -16.6869, "lon": -49.2648 }
}
```

---

## 🌐 APIs Públicas para Geocodificação Fallback

Se uma cidade não estiver na lista pré-mapeada, a aplicação pode consultar dinamicamente duas APIs gratuitas:

### 1. API Oficial de Municípios do IBGE (Buscar Código IBGE ou Detalhes)
- **URL**: `https://servicodados.ibge.gov.br/api/v1/localidades/municipios`
- **Uso**: Retorna a lista completa de todos os 5.570 municípios do Brasil com seus códigos IBGE de 7 dígitos.

### 2. API Nominatim / OpenStreetMap (Buscar Coordenadas por Nome/UF)
- **URL**: `https://nominatim.openstreetmap.org/search?q={Cidade},{UF},Brasil&format=json&limit=1`
- **User-Agent Obrigatório**: O Nominatim exige o envio do header `User-Agent: MeuApp/1.0`.

#### Exemplo de Geocodificador Dinâmico em TypeScript/JavaScript:

```typescript
export interface Coordenada {
  lat: number;
  lon: number;
  display_name?: string;
}

const cacheCoordenadas = new Map<string, Coordenada>();

export async function buscarCoordenadasCidade(cidade: string, uf: string): Promise<Coordenada | null> {
  const chave = `${cidade.toLowerCase().trim()}-${uf.toLowerCase().trim()}`;
  
  // 1. Verifica cache em memória
  if (cacheCoordenadas.has(chave)) {
    return cacheCoordenadas.get(chave)!;
  }

  // 2. Consulta Nominatim / OpenStreetMap
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cidade)},+${encodeURIComponent(uf)},+Brasil&format=json&limit=1`;
  
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'FiltroRaioApp/1.0' }
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (data && data.length > 0) {
      const coord: Coordenada = {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        display_name: data[0].display_name
      };
      cacheCoordenadas.set(chave, coord);
      return coord;
    }
  } catch (error) {
    console.error(`Erro ao buscar coordenadas para ${cidade}/${uf}:`, error);
  }

  return null;
}
```

---

## 🗄️ Estrutura Recomendada para Tabela no Banco de Dados (`cidades_coordenadas`)

Para aplicações com banco de dados (PostgreSQL/Supabase/MySQL/SQLite), recomenda-se criar uma tabela para armazenar as coordenadas de todas as cidades:

```sql
CREATE TABLE IF NOT EXISTS cidades_coordenadas (
  codigo_ibge VARCHAR(10) PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  uf VARCHAR(2) NOT NULL,
  latitude NUMERIC(10, 6) NOT NULL,
  longitude NUMERIC(10, 6) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para buscas rápidas por Nome + UF
CREATE INDEX IF NOT EXISTS idx_cidades_nome_uf ON cidades_coordenadas (nome, uf);
```
