# Plano de Implementação: Filtro por Raio Geográfico na Página de Licitações

> **Alvo**: Implantar o Filtro por Raio Geográfico na tela de Licitações (`/licitacoes`), calculando a distância por Haversine a partir de uma cidade-sede (padrão: Santa Cruz do Rio Pardo - SP) ou origem selecionada pelo usuário, exibindo badges nos cards e linhas da tabela, com controle de slider de 0 a 500 km.
> **Padrão de Execução**: Subagent-driven development e TDD com testes automatizados antes da conclusão.

---

## Tarefas de Implementação

### Tarefa 1: Módulo Central de Geolocalização e Cálculo Haversine (TDD)
- **Arquivos**:
  - `src/lib/geo/tipos.ts`: Definições de tipos (`PontoGeografico`, `CidadeCoordenada`, `OrigemOpcao`, etc.).
  - `src/lib/geo/cidades.ts`: Base de coordenadas de municípios com normalização de nomes sem acentos e busca flexível.
  - `src/lib/geo/haversine.ts`: Cálculo da distância esférica Haversine em km e utilitários de filtragem.
  - `src/lib/geo/haversine.test.ts`: Testes unitários com casos reais (ex: Santa Cruz do Rio Pardo até Ourinhos ~30km, até Bauru ~85km, até São Paulo ~300km).
- **Critério de Aceite**: Testes passando com 100% de sucesso.

### Tarefa 2: Componentes Visuais de Raio e Proximidade
- **Arquivos**:
  - `src/components/geo/DistanceBadge.tsx`: Badge elegante e semântica com ícone de veículo e distância formatada.
  - `src/components/geo/FiltroRaioGeografico.tsx`: Seletor de cidade de origem, slider de 0 a 500 km, presets rápidos (50km, 100km, 150km, 250km, 500km) e botão de limpar.
  - `src/components/geo/DistanceBadge.test.ts`: Testes unitários das faixas de cores e formatação do badge.
- **Critério de Aceite**: Componentes criados com acessibilidade e compatibilidade com Tailwind / Dark Mode.

### Tarefa 3: Integração no DTO e Modelos
- **Arquivos**:
  - `src/lib/dto.ts`: Adicionar `distancia_km?: number | null;` no tipo `LicitacaoDTO`.
  - `src/lib/types.ts`: Suporte aos campos de geolocalização se aplicável.
- **Critério de Aceite**: `npm run build` e tipos TypeScript estritamente válidos.

### Tarefa 4: Integração na UI de Licitações (Cards, Tabela e Filtros)
- **Arquivos**:
  - `src/components/LicitacaoCard.tsx`: Exibir `DistanceBadge` junto à localização e órgão do card.
  - `src/routes/licitacoes.index.tsx`:
    - Integrar o componente `FiltroRaioGeografico` na área de filtros avançados.
    - Manter estados `raioKm` e `origemSelecionada`.
    - Calcular `distancia_km` para cada item em tempo real a partir da cidade de origem.
    - Filtrar itens pela distância máxima quando `raioKm > 0`.
    - Exibir `DistanceBadge` na visualização em Tabela (coluna de detalhes/localização).
    - Adicionar chip de filtro ativo para o raio com botão de limpar.
- **Critério de Aceite**: Filtro funcional, permitindo deslizar o slider e ver a lista filtrando instantaneamente.

### Tarefa 5: Validação Completa, Testes e Build
- **Execução**:
  - `npm test`: Todos os testes da suite passando.
  - `npm run build`: Compilação de produção sem nenhum erro.
  - Commit no Git e entrega do link clicável.
- **Critério de Aceite**: App 100% íntegro e operacional.
