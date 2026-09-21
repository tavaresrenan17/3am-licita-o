# Plano de Implementação: Recursos de Engenharia para Licitações

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar recursos específicos para engenheiros de licitações: filtro de foco em engenharia, checklist de documentos técnicos, cronograma legal com prazo de impugnação, tags de decisão GO/NO-GO e funil de triagem no Dashboard.

**Architecture:** Expandir a interface com componentes voltados para a rotina de um orçamentista de obras públicas: `ChecklistDocumental`, `CronogramaLegal`, tags rápidas de descarte/interesse de triagem em `licitacoes.$id.tsx` e `FunilTriagem` no `index.tsx`.

**Tech Stack:** React 19, Vite, TanStack Router, TanStack Query, TailwindCSS v4, Lucide React, Sonner.

**Spec:** `docs/superpowers/specs/2026-09-21-engenharia-licitacoes-features.md`

## Global Constraints

- Manter 100% de compatibilidade com o schema e endpoints existentes.
- Usar datas no padrão brasileiro (`dd/MM/yyyy`).
- Garantir que todos os testes (`npm test`) continuem passando sem regressão.

---

### Task 1: Checklist de Documentos Técnicos e Cronograma Legal no Detalhe da Licitação

**Files:**
- Create: `src/components/EngenhariaWidgets.tsx`
- Modify: `src/routes/licitacoes.$id.tsx`

**Interfaces:**
- Consumes: `LicitacaoDTO`, `DocumentoLicitacao`, datas de publicação e limite.
- Produces: `<ChecklistDocumental />` e `<CronogramaLegal />` integrados na ficha da oportunidade.

- [ ] **Step 1: Criar componentes de engenharia em `src/components/EngenhariaWidgets.tsx`**
  - Implementar `<CronogramaLegal />` com cálculo do prazo limite de impugnação/esclarecimentos (3 dias úteis antes) e alertas de visita técnica.
  - Implementar `<ChecklistDocumental />` com status dos 4 pilares: Edital, Planilha Orçamentária, Projetos e Memorial Descritivo.

- [ ] **Step 2: Integrar os widgets na página `src/routes/licitacoes.$id.tsx`**
  - Inserir o `CronogramaLegal` logo após os dados principais.
  - Inserir o `ChecklistDocumental` antes da lista de documentos vinculados.

- [ ] **Step 3: Testar com vitest**
  - Executar: `npm test`
  - Esperado: Todos os testes passando.

---

### Task 2: Matriz de Decisão GO / NO-GO com Tags de Motivo de Descarte e Interesse

**Files:**
- Modify: `src/routes/licitacoes.$id.tsx`
- Modify: `src/routes/licitacoes.index.tsx`

**Interfaces:**
- Consumes: `useAtualizarInterno`.
- Produces: Chips rápidos de motivo de descarte/interesse que registram observações e histórico no banco.

- [ ] **Step 1: Adicionar chips rápidos de motivo de descarte em `src/routes/licitacoes.$id.tsx`**
  - Motivos: "Falta de Acervo Técnico (CAT)", "Margem Baixa / Inexequível", "Prazo de Execução Curto", "Logística / Raio Inviável", "Edital Restritivo".
  - Ao clicar, preenche a observação e permite salvar ou grava com 1 clique se status for "descartada".
  - Adicionar tags de interesse: "Alta Margem Estimada", "Acervo Técnico Pleno", "Obra Próxima à Sede".

- [ ] **Step 2: Adicionar chips rápidos no modal de observação rápida em `src/routes/licitacoes.index.tsx`**
  - Facilitar a inclusão do motivo sem precisar digitar texto longo.

- [ ] **Step 3: Testar execução com `npm test`**
  - Executar: `npm test`
  - Esperado: Todos os testes passando.

---

### Task 3: Funil de Triagem de Engenharia no Dashboard

**Files:**
- Modify: `src/routes/index.tsx`

**Interfaces:**
- Consumes: `MetricasDTO` (contagens por status interno).
- Produces: `<FunilTriagem />` visual no Dashboard mostrando a evolução das oportunidades pela esteira de vendas da construtora.

- [ ] **Step 1: Implementar o painel visual de funil em `src/routes/index.tsx`**
  - Exibir as etapas: Novas -> Em Análise -> Interessante -> Proposta Enviada -> Descartadas.
  - Exibir barras de proporção e links clicáveis para abrir o recorte filtrado.

- [ ] **Step 2: Testar com vitest**
  - Executar: `npm test`
  - Esperado: Passar 100%.

---

### Task 4: Validação no Navegador e Relatório Final de Engenharia

**Files:**
- Teste E2E via browser subagent.

- [ ] **Step 1: Navegar no browser pelo detalhe da licitação e testar o checklist, cronograma e tags de descarte.**
- [ ] **Step 2: Verificar o funil no dashboard e a busca com foco em engenharia.**
- [ ] **Step 3: Documentar no walkthrough.**
