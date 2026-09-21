# Design Spec: Modernização UX/UI e System Design — 3AM Licitação

**Data:** 2026-09-21  
**Autor:** Antigravity AI  
**Status:** Aprovado para Implementação  
**Escopo:** Frontend (Design System, UI/UX, System Design, Componentes, Rotas)

---

## 1. Contexto e Objetivos

O sistema **3AM Licitação** é uma plataforma focada em inteligência de mercado e análise de licitações públicas de **construção civil** e obras de engenharia a partir do PNCP (Portal Nacional de Contratações Públicas).
Após a inspeção visual e técnica em execução no navegador (`http://localhost:8080/`), foram identificados pontos cruciais de melhoria:

1. **Tipografia e Estética Industrial Moderna**: A aplicação declara `IBM Plex Sans` e `IBM Plex Mono` no CSS, porém as fontes web não estavam carregadas no `<head>`, resultando em fallback genérico. Além disso, o visual escuro pode ser enriquecido com micro-interações, efeitos de vidro (glassmorphism), bordas luminosas e status pulsantes.
2. **System Design — Command Palette Global (`Ctrl+K`)**: Facilidade de triagem rápida e navegação instantânea entre rotas, busca de licitações e acionamento de filtros sem tirar a mão do teclado.
3. **UX de Triagem e Curadoria de Construção Civil**: Na listagem de licitações, itens sem relevância para obras (ex.: alimentação, higiene) poluem a visualização. Introdução de barra de **Presets Rápidos** (Alta Aderência Obras, Prazos Críticos ≤ 3d, Grandes Obras > R$ 1M, Prioritárias) e alternância de visualização (**Tabela Densa vs. Cards Visuais**).
4. **Exportação de Dados**: Exportação para CSV formatado com 1 clique para relatórios executivos.
5. **Resolução de Sincronizações Travadas (System Design)**: Detecção e botão de recuperação/reset para jobs de sincronização órfãos ou congelados há horas.
6. **Eliminação de Hydration Mismatch**: Ajuste no `__root.tsx` e `AppShell` para eliminar erros de console na hidratação SSR/Client.

---

## 2. Arquitetura e Componentes Propostos

### 2.1. Design System & Tipografia (`src/routes/__root.tsx` & `src/styles.css`)
- Injeção das fontes `IBM Plex Sans` (400, 500, 600, 700) e `IBM Plex Mono` (400, 600) via Google Fonts no `<head>` do `__root.tsx`.
- Configuração de `suppressHydrationWarning` em `<html>` e `<body>`.
- Tokens semânticos aprimorados e utilitários de animação no `src/styles.css` (glow, shimmer skeletons, bordas elegantes).

### 2.2. Command Palette (`src/components/CommandPalette.tsx`)
- Implementação usando `cmdk` e atalho global `Ctrl+K` / `⌘K`.
- Acesso rápido a:
  - Navegação: Dashboard, Licitações, Sincronização.
  - Filtros rápidos: Construção Civil, Prazos Críticos, Prioritárias.
  - Ações: Copiar link da busca atual, abrir atalhos de teclado.
- Botão sutil na barra superior do `AppShell` indicando `Ctrl+K`.

### 2.3. Presets Rápidos e Alternância de Visualização (`src/routes/licitacoes.index.tsx`)
- Barra de Chips de Acesso Rápido:
  - 🏗️ *Alta Aderência Construção Civil* (ativa filtro de recomendadas / score ≥ 70)
  - ⏱️ *Prazos Críticos (≤ 3 dias)*
  - 💰 *Grandes Obras (> R$ 1M)*
  - ⭐ *Minhas Prioridades*
  - 📄 *Com Edital Baixado*
- Modo de Exibição Duplo:
  - **Tabela Densa**: Ideal para triagem massiva via teclado (`j`/`k`).
  - **Cards de Oportunidades**: Visão executiva com cartões contendo badge de urgência, valor em destaque, indicador circular de score e ações rápidas.
- Exportação para CSV (`src/lib/exportar-csv.ts`):
  - Gera CSV com BOM UTF-8 compatível com Excel brasileiro (; separador) contendo todos os dados visíveis e filtrados.

### 2.4. Refinamento de Componentes de Dados (`src/components/data-bits.tsx`)
- `StatusInternoBadge`: Adição de ponto indicador colorido (pulse dot para "Nova" e "Em Análise", verde para "Interessante", cinza para "Descartada").
- `StatusPncpBadge`: Estilo visual com ponto pulsante para "Recebendo proposta".
- `ScoreBadge`: Formato pill refinado com gradiente e barra de progresso sutil.
- `MetricCard`: Micro-elevação em hover, ícone com fundo translúcido estilizado.

### 2.5. Recuperação de Sincronização Travada (`src/routes/sincronizacao.tsx`)
- Tratamento no card de sincronização em andamento: caso o job esteja rodando há mais de 60 minutos sem progresso recente, exibir alerta visual e botão "Interromper e Resetar Rotina".

---

## 3. Critérios de Aceite e Verificação
1. Todas as fontes `IBM Plex Sans` e `IBM Plex Mono` carregadas e renderizadas com perfeição.
2. Atalho `Ctrl+K` abre a paleta de comandos instantaneamente em qualquer tela.
3. Botões de Presets rápidos filtram a lista de licitações imediatamente.
4. Alternância entre visão de Tabela e visão de Cards funcionando suavemente.
5. Exportação para CSV baixa arquivo `.csv` formatado.
6. Suíte de testes automatizados (`npm test`) passando 100% sem quebras.
7. Aplicação navegável e validada no navegador real via browser subagent.
