# Especificação de Design: Filtro por Raio Geográfico na Tela de Licitações

**Data**: 2026-09-22  
**Status**: Aprovado (execução autônoma solicitada pelo usuário)  
**Objetivo**: Implementar o filtro por raio geográfico na página de Licitações (`/licitacoes`), permitindo selecionar a cidade de origem/sede e o raio máximo em quilômetros (0 a 500 km), calculando distâncias precisas via Haversine e exibindo Badges visuais de distância em cada licitação.

---

## 1. Contexto e Necessidade

A empresa 3AM e seus operadores necessitam priorizar e filtrar licitações pela proximidade logística em relação à sua sede operacional (ex: Santa Cruz do Rio Pardo - SP) ou filiais/pontos de interesse (São Paulo, Ourinhos, Bauru, Marília, etc.).
A documentação e insumos fornecidos na pasta `filtro-por-raio/` definem os algoritmos Haversine, bases de cidades com coordenadas IBGE, estruturas de banco e padrões de componentes visuais.

---

## 2. Requisitos Funcionais

1. **Definição de Ponto de Referência (Origem)**:
   - Suporte a uma lista de origens predefinidas com coordenadas (ex: Santa Cruz do Rio Pardo/SP, Ourinhos/SP, Bauru/SP, Marília/SP, Presidente Prudente/SP, São Paulo/SP, Campinas/SP, Ribeirão Preto/SP, Curitiba/PR, Londrina/PR, Belo Horizonte/MG, Rio de Janeiro/RJ, Brasília/DF).
   - Cidade padrão inicial: Santa Cruz do Rio Pardo - SP (sede de referência no interior paulista).
   - O usuário pode trocar a cidade de origem a qualquer momento via dropdown com busca ou opções diretas.

2. **Controle de Raio (Slider & Presets)**:
   - Slider de 0 km a 500 km em passos de 10 km (0 km = "Sem limite / Nacional").
   - Presets rápidos de 1 clique: 50 km, 100 km, 150 km, 250 km e 500 km.
   - Botão "Limpar Raio" que reseta o filtro para 0 km.

3. **Cálculo de Distância (Haversine)**:
   - Mapeamento robusto de municípios para coordenadas geográficas (`lat`, `lon`), tolerante a acentos e variações de caixa (ex: "Santa Cruz do Rio Pardo", "santa cruz do rio pardo").
   - Cálculo instantâneo da distância em linha reta (Haversine, $R = 6371$ km) com 1 casa decimal.
   - Atribuição do atributo `distancia_km` ao DTO/objeto da licitação.

4. **Filtragem e Ordenação**:
   - Quando o raio for maior que 0 km:
     - Exibir apenas licitações cuja distância calculada seja menor ou igual ao raio selecionado.
     - Indicar o número de licitações no raio de alcance.
     - Opção de ordenar por proximidade ("Mais próximas").

5. **Exibição Visual (Badges e Destaques)**:
   - No `LicitacaoCard.tsx`: Badge `DistanceBadge` com ícone de veículo/marcador, distância em km e cores semânticas:
     - Verde / Esmeralda (<= 100 km): Proximidade imediata.
     - Âmbar / Amarelo (101 a 250 km): Média distância.
     - Neutro / Cinza (> 250 km): Longa distância.
   - Na visualização em Tabela (`licitacoes.index.tsx`): Badge de distância exibido ao lado do município e órgão.
   - Na barra de filtros ativos: Chip mostrando "📍 Raio: até X km (de [Cidade/UF])" com botão de remoção rápida.

---

## 3. Arquitetura Técnica

```
[ Usuário ajusta Raio (ex: 150 km) e Origem (Santa Cruz do Rio Pardo) ]
                                 │
                                 ▼
         [ src/lib/geo/cidades.ts ]  <── Coordenadas de Municípios
         [ src/lib/geo/haversine.ts ] <── Fórmula Haversine ultra-rápida (< 1μs)
                                 │
                                 ▼
              [ Enriquecimento com distancia_km ]
                                 │
                                 ▼
   ┌─────────────────────────────┴─────────────────────────────┐
   ▼                                                           ▼
[ LicitacaoCard (Modo Grid) ]              [ Tabela Licitações (Modo Lista) ]
- DistanceBadge (🚗 45.2 km)               - DistanceBadge na coluna Local
- Cores por proximidade                     - Tooltip e indicação de raio
```

---

## 4. Módulos e Componentes

1. `src/lib/geo/tipos.ts`: Interfaces de ponto geográfico, cidade e configuração de raio.
2. `src/lib/geo/cidades.ts`: Dicionário e normalizador de cidades de SP e polos nacionais com coordenadas.
3. `src/lib/geo/haversine.ts`: Implementação do algoritmo Haversine e funções de filtragem por raio.
4. `src/components/geo/DistanceBadge.tsx`: Badge reutilizável com cores por faixa de distância.
5. `src/components/geo/FiltroRaioGeografico.tsx`: Painel interativo com seletor de origem, slider e botões rápidos.
6. Atualizações em `src/routes/licitacoes.index.tsx` e `src/components/LicitacaoCard.tsx`.
