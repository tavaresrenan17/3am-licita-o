# Design Spec: Seleção em Lote de Licitações, Sincronização de Documentos e Painel Minhas Licitações

**Data:** 2026-09-22  
**Status:** Aprovado  
**Autor:** Antigravity (Superpowers Brainstorming & Architecture)  

---

## 1. Visão Geral e Objetivos

O objetivo desta funcionalidade é fornecer aos analistas e engenheiros um fluxo ágil e produtivo para:
1. **Selecionar licitações em lote** na aba principal de Licitações (`/licitacoes`) via checkboxes individuais e em massa.
2. **Disparar a sincronização dos documentos** (editais, termos de referência, planilhas orçamentárias) dessas licitações com 1 clique através de uma barra de ações flutuante.
3. **Refletir o status visual como "Baixado"** no catálogo de licitações para qualquer licitação que tenha seus documentos baixados e extraídos.
4. **Redirecionar automaticamente para a página Minhas Licitações** (`/minhas-licitacoes`), um novo hub focado na análise cautelosa, detalhada e orientada por IA de cada licitação com acervo documental disponível.

---

## 2. Experiência do Usuário (UX/UI)

### 2.1. Seleção em Lote na Aba Licitações (`/licitacoes`)
- **Checkbox no cabeçalho:**
  - Permite marcar/desmarcar todas as licitações visíveis na página atual com 1 clique.
  - Estado indeterminado (tracinho) quando apenas parte das licitações da página estiver selecionada.
- **Checkbox por linha (Modo Tabela) e por card (Modo Grid):**
  - Checkbox minimalista com estilo Radix UI / Tailwind (`Checkbox` component).
  - O clique no checkbox seleciona/deseleciona sem disparar a navegação do card/linha.
- **Barra de Ações Flutuante (Floating Bulk Action Bar):**
  - Surge no rodapé da viewport com animação suave (*slide-up + fade-in*) sempre que `selecionadas.size > 0`.
  - Contém:
    - Indicador visual: `X licitações selecionadas`.
    - Botão primário com destaque: `Sincronizar Documentos (X)` com ícone animado de download/refresh.
    - Botão secundário: `Desmarcar Tudo`.
    - Botão de atalho: `Ir para Minhas Licitações`.

### 2.2. Feedback e Sincronização
- Ao clicar em `Sincronizar Documentos`:
  - O botão entra em estado pendente (*loading spinner* com contador de progresso).
  - Toast informativo inicial: `"Baixando documentos de X licitações..."`.
  - Ao concluir:
    - Toast de sucesso com resumo: `"X licitações sincronizadas com sucesso!"`.
    - O status visual de documentos na tabela e nos cards passa para o badge verde **"Baixado"**.
    - Redirecionamento automático para a rota `/minhas-licitacoes?ids=...`.

### 2.3. Painel Minhas Licitações (`/minhas-licitacoes`)
- **Conceito:** A "Biblioteca de Minhas Licitações" das licitações — um ambiente limpo, focado e livre de distrações para auditoria, leitura de editais e acionamento de IA.
- **Estrutura:**
  - Integrado ao `AppShell` com novo item de navegação no menu lateral e atalho de teclado (`g a`).
  - Cabeçalho executivo com contadores: *Total em Minhas Licitações*, *Documentos Prontos*, *Análises de IA Geradas*, *Investimento Estimado Total*.
  - **Filtros rápidos:** Busca por palavra-chave, filtro por status interno (Nova, Em Análise, Interessante, Descartada), ordenação por Score de IA e Valor.
  - **Visualização em 2 painéis (Split View / Master-Detail opcional) ou Cards Ricos:**
    - Cada item exibe: Órgão, UF, Município, Objeto completo, Valor Estimado, Prazo de Propostas e Score de Aderência.
    - Lista de anexos essenciais baixados (Edital, Termo de Referência, Planilhas) com indicador de tamanho, páginas e texto extraído.
    - Botão de ação rápida: **"Analisar com IA"** com geração e exibição de análise sintética de riscos e requisitos.
    - Seletor de Status Interno para triagem imediata.
    - Link direto para a visualização completa da licitação (`/licitacoes/$id`).

---

## 3. Arquitetura Técnica e Contratos

### 3.1. Roteamento e Navegação
- **Nova rota:** `src/routes/minhas-licitacoes.tsx` registrada no TanStack Router (`createFileRoute("/minhas-licitacoes")`).
- **Menu Lateral (`src/components/AppShell.tsx`):**
  - Inclusão do item `{ to: "/minhas-licitacoes", label: "Minhas Licitações", icon: Library }`.
  - Inclusão do atalho e item na `CommandPalette`.

### 3.2. Server Functions e Serviços
- **Nova Server Function (`src/services/licitacoes.functions.ts`):**
  - `sincronizarDocumentosLicitacoesLoteFn`:
    - Validação Zod: `{ ids: z.array(z.string().uuid()) }`.
    - Executa `sincronizarArquivosLicitacaoSobDemanda(id)` com concorrência controlada (ex: 2 licitações simultâneas, até 5 arquivos cada) para respeitar limites do servidor e conexões do Supabase.
    - Atualiza `documentos_estado` na tabela `documentos_estado` para `'completo'` (ou `'erro'`) para cada licitação processada.
    - Retorna resumo detalhado: `{ processados: number, totalArquivos: number, falhas: string[] }`.
- **Server Function de listagem para Minhas Licitações (`obterMinhasLicitacoesFn`):**
  - Retorna licitações que possuem documentos baixados (`documentos_estado = 'completo'` ou que possuam registros em `documentos_arquivo`) ou cujos IDs foram explicitamente selecionados.

### 3.3. Client API e Hooks (`src/services/api.ts`)
- `useSincronizarDocumentosLote()`:
  - Mutation do TanStack Query com invalidação automática de `['licitacoes']`, `['metricas']` e `['minhas-licitacoes']`.
- `useMinhasLicitacoes(params)`:
  - Query hook com cache e refetch inteligente.

### 3.4. Componentes UI
- `src/components/BarraAcoesLote.tsx`: Barra flutuante de ações em massa.
- `src/components/CheckboxLicitacao.tsx`: Checkbox acessível e estilizado.
- `src/components/StatusDocumentosBadge.tsx`: Badge visual ("Pendente", "Coletando", "Baixado", "Erro").

---

## 4. Plano de Testes e Verificação

1. **Testes de Unidade / Integração (Vitest):**
   - Teste de `sincronizarDocumentosLicitacoesLoteFn` com mock do otimizador.
   - Teste de renderização e seleção de licitações com estado multi-select.
   - Teste do cálculo e badge de status "Baixado".
2. **Testes de Rota e Navegação:**
   - Verificação de renderização da rota `/minhas-licitacoes`.
   - Verificação do redirecionamento após a sincronização em lote.
3. **Validação E2E no Navegador:**
   - Seleção de múltiplos itens via checkbox na tabela de licitações.
   - Aparecimento da barra de ações flutuante.
   - Disparo da sincronização e visualização do badge "Baixado".
   - Chegada e navegação na página Minhas Licitações.
