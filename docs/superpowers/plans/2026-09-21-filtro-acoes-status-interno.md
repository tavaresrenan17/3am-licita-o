# Plano de Implementação - Sistema de Filtros & Categorização por Status Interno (Ações)

## 1. Visão Geral
Atualmente, as licitações possuem um campo no banco de dados e tipos (`status_interno`: `"nova" | "em_analise" | "interessante" | "descartada" | "proposta_enviada"`).
Porém:
1. Na listagem de licitações (`src/routes/licitacoes.index.tsx`), o botão **Ações** na tabela é um dropdown simples, sem destaque visual do status atual nem ícones coloridos.
2. Não há uma forma rápida e destacada de filtrar por status interno na listagem de licitações (faltam tabs / pills de triagem com contagem ou badges rápidos para saber quais licitações são "Interessantes", "Em Análise", "Descartadas" ou "Novas").
3. Nos filtros avançados da listagem, não havia o seletor explícito de status interno no painel de filtros rápidos.
4. Na página de detalhes (`src/routes/licitacoes.$id.tsx`), na sidebar de decisão, havia botões rápidos com inconsistência de valor (ex: `"participando"` em vez do enum suportado `"interessante"` / `"em_analise"` / `"descartada"`).

Este plano visa enriquecer completamente a experiência de triagem comercial:
- Barra de abas/pills de status interno no topo da listagem de licitações.
- Botão "Ações" redesenhado na tabela, permitindo alterar o status interno com 1 clique, feedback visual imediato e badge colorido.
- Inclusão do filtro de status interno no painel de filtros combinados.
- Alinhamento da sidebar de Decisão na página de detalhes.

---

## 2. Tarefas de Implementação

### Tarefa 1: Barra de Triagem Rápida por Status Interno na Listagem (`licitacoes.index.tsx`)
- Adicionar uma barra de pills/chips logo acima da tabela ou junto aos filtros de busca:
  - 🌐 **Todas**
  - ⭐ **Interessantes** (`interessante`)
  - 🔍 **Em Análise** (`em_analise`)
  - 🆕 **Novas / Sem Triagem** (`nova`)
  - ❌ **Descartadas** (`descartada`)
  - 📤 **Proposta Enviada** (`proposta_enviada`)
- Conectar o clique de cada pill ao estado do filtro `status_interno` (atualizando via navegação/URL search params e resetando a página para 1).
- Adicionar o campo `status_interno` no formulário de Filtros Avançados (`ComboFiltro` / `Select`).

### Tarefa 2: Redesign do Botão "Ações" na Tabela de Licitações (`licitacoes.index.tsx`)
- Atualizar a coluna de Ações para exibir:
  - Indicador visual/badge do status atual (ou botão estilizado com menu dropdown).
  - Itens de menu com ícones específicos e cores semânticas:
    - ⭐ **Marcar como Interessante** (âmbar/ouro ou esmeralda)
    - 🔍 **Colocar Em Análise** (azul/ciano)
    - ❌ **Descartar Licitação** (vermelho/rosa)
    - 📤 **Marcar Proposta Enviada** (roxo/índigo)
    - 🔄 **Redefinir como Nova** (cinza/ardósia)
  - Exibir checkmark no item que reflete o status atual.
  - Chamar a mutation de atualização de status interno (`atualizarStatusInternoMutation` ou Supabase RPC/update) com toast de sucesso instantâneo (`sonner`).

### Tarefa 3: Alinhamento e Refinamento do Detalhe da Licitação (`licitacoes.$id.tsx`)
- Ajustar os botões rápidos na seção "Decisão da Construtora" da sidebar para refletirem exatamente os status do enum:
  - Interessante (Verde / Ícone Star)
  - Em Análise (Azul / Ícone Search)
  - Descartada (Vermelho / Ícone XCircle)
  - Proposta Enviada (Roxo / Ícone Send)
- Garantir sincronia com a tabela de histórico e observações.

### Tarefa 4: Validação e Testes
- Executar suíte de testes automatizados (`npx vitest run`).
- Criar/atualizar testes unitários ou de integração para a filtragem por status interno.
- Testar via subagente de browser a navegação, filtragem e alteração de status através do botão Ações.
