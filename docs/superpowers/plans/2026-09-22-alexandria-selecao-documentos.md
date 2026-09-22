# Alexandria & Sincronização em Lote de Documentos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar seleção em lote por checkbox na tela de Licitações, botão flutuante para sincronizar documentos das selecionadas com atualização para status "Baixado", e redirecionamento para o novo hub executivo de análise "Alexandria" (`/alexandria`).

**Architecture:** 
- Camada de Dados/Servidor: Server Function `sincronizarDocumentosLicitacoesLoteFn` executa o download concorrente dos editais essenciais e marca `documentos_estado = 'completo'` no Supabase. `obterLicitacoesAlexandriaFn` busca as licitações com acervo pronto.
- Camada de Estado/API: Hooks `useSincronizarDocumentosLote` e `useLicitacoesAlexandria` com invalidação do TanStack Query.
- Camada de Interface: Checkboxes nas linhas e cards de `/licitacoes`, barra flutuante `BarraAcoesLote` com contador e ação rápida, badge "Baixado" e a rota `/alexandria` no TanStack Router integrada ao `AppShell`.

**Tech Stack:** React 19, TanStack Router, TanStack Query, Tailwind CSS, Lucide Icons, Supabase, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-22-alexandria-selecao-documentos-design.md`

## Global Constraints
- Toda resposta e interface em português do Brasil.
- Manter integridade de comentários existentes e não introduzir quebras em rotas legadas.
- Sempre fornecer link clicável para visualização do aplicativo ao concluir.
- Nenhuma dependência externa nova além das já instaladas.

---

### Task 1: Serviços de Backend e Hooks de Sincronização em Lote

**Files:**
- Modify: `src/services/documentos/otimizador.server.ts`
- Modify: `src/services/licitacoes.functions.ts`
- Modify: `src/services/api.ts`
- Create: `src/services/documentos/lote.test.ts`

**Interfaces:**
- Produces: `sincronizarDocumentosLicitacoesLoteFn({ data: { ids: string[] } })`
- Produces: `obterLicitacoesAlexandriaFn({ data?: { ids?: string[], busca?: string } })`
- Produces: `useSincronizarDocumentosLote()`
- Produces: `useLicitacoesAlexandria()`

- [ ] **Step 1: Escrever teste de unidade para a sincronização em lote**
  Criar `src/services/documentos/lote.test.ts` testando o comportamento de agrupamento e retorno da sincronização em lote.

- [ ] **Step 2: Executar teste para verificar falha inicial**
  Run: `npx vitest run src/services/documentos/lote.test.ts`
  Expected: FAIL (funções e mocks ainda não implementados).

- [ ] **Step 3: Implementar sincronização em lote e persistência de status**
  Em `otimizador.server.ts`, garantir que `documentos_estado` seja gravado como `'completo'` quando houver documentos extraídos. Em `licitacoes.functions.ts`, implementar `sincronizarDocumentosLicitacoesLoteFn` e `obterLicitacoesAlexandriaFn`. Em `api.ts`, exportar `useSincronizarDocumentosLote` e `useLicitacoesAlexandria`.

- [ ] **Step 4: Executar testes para verificar sucesso**
  Run: `npx vitest run src/services/documentos/lote.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  Run: `git add src/services/documentos/otimizador.server.ts src/services/licitacoes.functions.ts src/services/api.ts src/services/documentos/lote.test.ts && git commit -m "feat(api): adicionar funcoes e hooks para sincronizacao em lote e hub alexandria"`

---

### Task 2: Componentes UI de Seleção, Badge "Baixado" e Barra Flutuante

**Files:**
- Create: `src/components/StatusDocumentosBadge.tsx`
- Create: `src/components/BarraAcoesLote.tsx`
- Modify: `src/routes/licitacoes.index.tsx`
- Create: `src/components/BarraAcoesLote.test.tsx`

**Interfaces:**
- Produces: `<StatusDocumentosBadge estado={l.documentos_estado} total={l.documentos_total} />`
- Produces: `<BarraAcoesLote selecionadasCount={count} onSincronizar={fn} onDesmarcar={fn} isSincronizando={bool} />`

- [ ] **Step 1: Escrever teste do componente `BarraAcoesLote`**
  Verificar renderização de contagem, clique de sincronizar e clique de desmarcar.

- [ ] **Step 2: Executar teste para verificar falha inicial**
  Run: `npx vitest run src/components/BarraAcoesLote.test.tsx`
  Expected: FAIL.

- [ ] **Step 3: Implementar `StatusDocumentosBadge`, `BarraAcoesLote` e integração em `licitacoes.index.tsx`**
  - Implementar `StatusDocumentosBadge` com suporte explícito a estado `"Baixado"` com badge verde esmeralda e ícone de check.
  - Implementar `BarraAcoesLote` flutuante e responsiva no rodapé.
  - Em `licitacoes.index.tsx`:
    - Adicionar estado `selecionadas: Set<string>`.
    - Adicionar checkbox no cabeçalho da tabela (selecionar todos visíveis).
    - Adicionar checkbox em cada linha da tabela e no topo de cada card do modo grid.
    - Integrar mutação `useSincronizarDocumentosLote` com toast de progresso e redirecionamento para `/alexandria`.

- [ ] **Step 4: Executar testes de componentes**
  Run: `npx vitest run src/components/BarraAcoesLote.test.tsx`
  Expected: PASS.

- [ ] **Step 5: Commit**
  Run: `git add src/components/StatusDocumentosBadge.tsx src/components/BarraAcoesLote.tsx src/components/BarraAcoesLote.test.tsx src/routes/licitacoes.index.tsx && git commit -m "feat(ui): adicionar checkbox de selecao em lote, badge baixado e barra flutuante"`

---

### Task 3: Criação da Rota e Painel Alexandria (`/alexandria`)

**Files:**
- Create: `src/routes/alexandria.tsx`
- Create: `src/routes/alexandria.test.tsx`

**Interfaces:**
- Produces: Rota TanStack Router `/alexandria`
- Consumes: `useLicitacoesAlexandria()`, `useAtualizarInterno()`, `useAnalisarComIa()`

- [ ] **Step 1: Escrever teste básico da rota Alexandria**
  Testar montagem da página, listagem vazia e listagem com itens.

- [ ] **Step 2: Executar teste para verificar falha inicial**
  Run: `npx vitest run src/routes/alexandria.test.tsx`
  Expected: FAIL (rota ainda não criada).

- [ ] **Step 3: Implementar a rota `src/routes/alexandria.tsx`**
  - Integração com `AppShell`.
  - Contadores no topo (Total no Hub, Documentos Prontos, Analisadas por IA, Valor Global).
  - Filtros rápidos por texto e status interno.
  - Cards detalhados com:
    - Identificação canônica do PNCP, Órgão, UF, Município, Objeto.
    - Lista de anexos/editais com links para download e badge de texto extraído.
    - Botão de ação rápida "Analisar com IA" que gera o diagnóstico com síntese imediata.
    - Seletor de status interno com feedback instantâneo.
    - Link para a página de detalhe `/licitacoes/$id`.

- [ ] **Step 4: Executar testes da rota Alexandria**
  Run: `npx vitest run src/routes/alexandria.test.tsx`
  Expected: PASS.

- [ ] **Step 5: Commit**
  Run: `git add src/routes/alexandria.tsx src/routes/alexandria.test.tsx && git commit -m "feat(alexandria): criar hub alexandria para analise detalhada de licitacoes"`

---

### Task 4: Navegação Global no AppShell e Rotas

**Files:**
- Modify: `src/components/AppShell.tsx`
- Modify: `src/components/CommandPalette.tsx`

**Interfaces:**
- Produces: Item de navegação "Alexandria" no sidebar e header.
- Produces: Atalho na paleta de comando.

- [ ] **Step 1: Adicionar Alexandria no NAV do `AppShell.tsx` e CommandPalette**
  - Adicionar `{ to: "/alexandria", label: "Alexandria", icon: Library }` no menu lateral de navegação.
  - Adicionar comando "Ir para Alexandria" na `CommandPalette`.

- [ ] **Step 2: Executar testes gerais de rotas e componentes**
  Run: `npm test`
  Expected: PASS.

- [ ] **Step 3: Commit**
  Run: `git add src/components/AppShell.tsx src/components/CommandPalette.tsx && git commit -m "feat(nav): integrar rota alexandria ao appshell e command palette"`

---

### Task 5: Validação Integrada e Verificação Final

**Files:**
- Run: Suíte de testes completa `npm run test`
- Run: Verificação de tipagem / build `npm run build`
- Verify: Aplicação em execução no navegador em `http://localhost:8080/licitacoes` e `http://localhost:8080/alexandria`

- [ ] **Step 1: Executar todos os testes**
  Run: `npm run test`

- [ ] **Step 2: Executar verificação de build do Vite**
  Run: `npm run build`

- [ ] **Step 3: Commit final e entrega**
  Run: `git commit -am "chore: conclusao e validacao completa do hub alexandria e sincronizacao em lote"`
