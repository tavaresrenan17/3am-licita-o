# Plano de Implementação: Modernização UX/UI e System Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernizar o design UX/UI, tipografia, Command Palette global, presets rápidos de construção civil, visualização em cards/tabela e exportação para CSV no frontend do 3AM Licitação.

**Architecture:** Aprimorar o Design System com Google Fonts nativas, micro-interações e badges enriquecidos; adicionar `CommandPalette` global com `cmdk` integrado ao `AppShell`; adicionar barra de presets inteligentes e alternância Cards/Tabela na listagem de licitações; implementar utilitário de exportação para CSV formatado; fornecer recuperação de rotina travada na tela de sincronização.

**Tech Stack:** React 19, Vite, TanStack Router, TanStack Query, TailwindCSS v4, cmdk, Radix UI, Lucide React, Sonner.

**Spec:** `docs/superpowers/specs/2026-09-21-front-ux-ui-system-design.md`

## Global Constraints

- Manter 100% de compatibilidade com os tipos e serviços existentes (`src/services/api.ts`, `src/lib/types.ts`).
- Seguir o tema escuro industrial do sistema (grafite azulada + acento âmbar).
- Não quebrar nenhum teste automatizado existente (`npm test`).
- Respostas e textos de interface sempre em Português do Brasil.

---

### Task 1: Tipografia Industrial, Correção de Hidratação e Estilização de Badges

**Files:**
- Modify: `src/routes/__root.tsx`
- Modify: `src/styles.css`
- Modify: `src/components/data-bits.tsx`

**Interfaces:**
- Consumes: Google Fonts (`IBM Plex Sans`, `IBM Plex Mono`), tokens de status interno e PNCP.
- Produces: `StatusInternoBadge`, `StatusPncpBadge`, `ScoreBadge` e `MetricCard` aprimorados com glow, indicadores de pulso e micro-interações.

- [ ] **Step 1: Atualizar `__root.tsx` com fontes do Google Fonts e supressão de aviso de hidratação**
  - Adicionar `<link rel="preconnect" href="https://fonts.googleapis.com">` e `<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="">`.
  - Adicionar `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">`.
  - Adicionar `suppressHydrationWarning` em `<html>` e `<body>`.

- [ ] **Step 2: Atualizar `src/styles.css` com classes de micro-interações, brilho e animações**
  - Adicionar utilitários para shimmer, cards com glow de hover, badges com dot indicators.

- [ ] **Step 3: Aprimorar `src/components/data-bits.tsx`**
  - Adicionar dot pulsante para status ativos (Nova, Em Análise, Recebendo proposta).
  - Enriquecer `MetricCard` com hover suave e fundo sutil translúcido para os ícones.
  - Aprimorar `ScoreBadge` com pill visual moderna e gradiente de preenchimento.

- [ ] **Step 4: Executar testes para garantir estabilidade**
  - Executar: `npm test`
  - Esperado: Todos os testes passando.

---

### Task 2: Command Palette Global (`Ctrl+K`) e Header do AppShell

**Files:**
- Create: `src/components/CommandPalette.tsx`
- Modify: `src/components/AppShell.tsx`

**Interfaces:**
- Consumes: `@tanstack/react-router`, `cmdk`, `lucide-react`.
- Produces: Componente `<CommandPalette />` global com atalho `Ctrl+K` / `⌘K` e botão disparador no header.

- [ ] **Step 1: Criar `src/components/CommandPalette.tsx`**
  - Implementar diálogo de comando com pesquisa instantânea, navegação para rotas (Dashboard, Licitações, Sincronização), filtros rápidos de licitações e atalhos de teclado.
  - Suportar atalho de teclado `Ctrl+K` / `⌘K` globalmente.

- [ ] **Step 2: Integrar `CommandPalette` no `src/components/AppShell.tsx`**
  - Adicionar botão de atalho `Ctrl+K` com estilo Kbd na barra superior de ações do AppShell.
  - Renderizar o componente `<CommandPalette />` dentro do shell da aplicação.

- [ ] **Step 3: Testar e validar renderização**
  - Executar: `npm test`
  - Esperado: Passar sem erros.

---

### Task 3: Presets de Construção Civil, Modo Cards vs Tabela e Exportação CSV na Listagem

**Files:**
- Create: `src/lib/exportar-csv.ts`
- Create: `src/components/LicitacaoCard.tsx`
- Modify: `src/routes/licitacoes.index.tsx`

**Interfaces:**
- Consumes: `LicitacaoDTO`, `FiltrosLicitacoes`.
- Produces: Exportação para CSV (`exportarLicitacoesCsv`), visualização em Cards (`LicitacaoCard`), barra de presets rápidos de obras.

- [ ] **Step 1: Criar utilitário `src/lib/exportar-csv.ts`**
  - Implementar função para converter lista de licitações em arquivo `.csv` com BOM UTF-8 (compatível com Microsoft Excel).

- [ ] **Step 2: Criar componente `src/components/LicitacaoCard.tsx`**
  - Card responsivo exibindo Objeto, Órgão, Município/UF, Valor Estimado em destaque, Prazo com badge de urgência, Score de aderência e menu de ações rápidas.

- [ ] **Step 3: Atualizar `src/routes/licitacoes.index.tsx`**
  - Adicionar barra de Presets Rápidos:
    * 🏗️ Alta Aderência (Construção Civil)
    * ⏱️ Prazos Críticos (≤ 3 dias)
    * 💰 Grandes Obras (> R$ 1M)
    * ⭐ Minhas Prioritárias
    * 📄 Com Edital Baixado
  - Adicionar alternador de visão (Tabela vs Cards) com persistência em localStorage ou estado local.
  - Adicionar botão "Exportar CSV" ao lado de "Copiar link".
  - Renderizar lista de Cards quando o modo Cards estiver ativo.

- [ ] **Step 4: Executar testes de unidade e regressão**
  - Executar: `npm test`
  - Esperado: Todos os testes passando.

---

### Task 4: Dashboard Aprimorado e Gestão de Sincronizações Travadas

**Files:**
- Modify: `src/routes/index.tsx`
- Modify: `src/routes/sincronizacao.tsx`

**Interfaces:**
- Consumes: `useMetricas`, `useLicitacoes`, `useSincronizacaoPNCP`.
- Produces: Ações rápidas de triagem nos destaques do Dashboard e opção de interromper/resetar jobs de sincronização paralisados há muito tempo.

- [ ] **Step 1: Aprimorar Oportunidades em Destaque no `src/routes/index.tsx`**
  - Permitir favoritar/marcar prioridade e exibir badge de urgência e categoria diretamente nos itens em destaque do Dashboard.

- [ ] **Step 2: Aprimorar Sincronização em `src/routes/sincronizacao.tsx`**
  - Adicionar botão "Interromper e resetar sincronização" visível quando um job estiver em andamento há muito tempo, com diálogo de confirmação.

- [ ] **Step 3: Testar suíte de testes**
  - Executar: `npm test`
  - Esperado: Passar 100%.

---

### Task 5: Validação Visual no Navegador e Entrega

**Files:**
- Teste E2E via browser subagent em `http://localhost:8080/`.

- [ ] **Step 1: Navegar no browser subagent pelas páginas atualizadas**
  - Testar Dashboard, Command Palette (`Ctrl+K`), Listagem de Licitações (Tabela e Cards), Presets de filtro e Exportação CSV.
- [ ] **Step 2: Capturar screenshots e validar ausência de erros no console.**
