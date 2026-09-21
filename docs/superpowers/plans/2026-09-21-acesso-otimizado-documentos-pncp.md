# Acesso Otimizado aos Documentos do PNCP para Análise com IA

## Contexto e Problema
O acervo do PNCP contém dezenas de milhares de arquivos anexos (editais, planilhas, termos de referência, minutas, recibos de diário oficial). Atualmente, sincronizar 8.000+ arquivos em lote de forma sequencial leva muitas horas, esbarra no rate limit do PNCP (2 req/s) e consome recursos massivos com documentos de licitações que podem nunca ser analisadas pela equipe.

A IA só precisa ler os editais e projetos das licitações de interesse. Precisamos de uma arquitetura que permita:
1. **Zero Espera Prévia (Just-in-Time Streaming):** A IA lê diretamente o edital no momento da análise, sem exigir sincronização prévia de 8.000 arquivos.
2. **Download e Extração Paralela Multithread dos Anexos da Licitação:** Quando uma licitação tem 3 arquivos (edital, minuta, termo de referência), baixá-los em paralelo em ~1 a 2 segundos.
3. **Filtro Seletivo de Documentos:** Descartar arquivos que não agregam valor analítico (recibos, certidões, comprovantes) e focar nos arquivos vitais (`edital`, `projeto`, `orcamento`, `termo_de_referencia`).
4. **Ação Rápida sob Demanda na UI:** Botão na tela de detalhes para sincronizar e extrair todos os anexos da licitação em 1 clique com feedback visual de prontidão para a IA.
5. **Worker Otimizado por Prioridade Operacional:** Fila em segundo plano orientada por relevância (licitações com score alto, abertas e favoritadas).

---

## Estrutura de Arquivos e Responsabilidades

- [NEW] `src/services/documentos/otimizador.server.ts`
  - Responsável pela seleção inteligente de documentos essenciais (regras de exclusão de recibos/certidões e priorização de editais).
  - Download e extração paralela com `Promise.allSettled` e pool HTTP keep-alive.
  - Sincronização completa de uma licitação individual sob demanda em tempo real.
- [MODIFY] `src/services/analise/repositorio.analise.server.ts`
  - Integração do otimizador de download paralelo na rotina `enriquecerDocumentosSobDemanda`.
- [MODIFY] `src/services/licitacoes.functions.ts`
  - Nova Server Function `sincronizarDocumentosLicitacaoFn` para disparar a sincronização dos arquivos de uma licitação sob demanda.
- [MODIFY] `src/services/api.ts`
  - Novo hook `useSincronizarDocumentosLicitacao` com invalidação automática de cache do TanStack Query.
- [MODIFY] `src/routes/licitacoes.$id.tsx`
  - Botão na aba de documentos para "Sincronizar Arquivos" sob demanda com badge de status para IA.
  - Indicador de prontidão documental no painel de Análise com IA.
- [NEW] `src/services/documentos/otimizador.test.ts`
  - Testes unitários para o filtro seletivo de editais e download concorrente.

---

## Tarefas de Implementação

### Tarefa 1: Motor de Seleção e Download Concorrente de Documentos (`otimizador.server.ts`)
- Implementar `filtrarDocumentosEssenciais(docs)` para priorizar editais e descartar recibos/certidões.
- Implementar `sincronizarArquivosLicitacaoSobDemanda(licitacaoId)` com concorrência paralela e extração em memória.
- Testar com suíte dedicada no Vitest.

### Tarefa 2: Integração com o Repositório de Análise
- Integrar `sincronizarArquivosLicitacaoSobDemanda` em `repositorio.analise.server.ts`, garantindo que quando o usuário clica em "Analisar com IA", todos os editais da licitação sejam baixados concorrentemente em menos de 2 segundos.

### Tarefa 3: Server Functions e Hooks de Sincronização Sob Demanda
- Adicionar `sincronizarDocumentosLicitacaoFn` em `licitacoes.functions.ts`.
- Adicionar `useSincronizarDocumentosLicitacao` em `api.ts`.

### Tarefa 4: Interface e Feedback Visual no Detalhe da Licitação
- Adicionar botão de sincronização pontual na aba "Documentos" do detalhe da licitação.
- Exibir badge "Pronto para IA" quando o texto já estiver extraído em cache.
- Adicionar indicador visual no Sheet lateral de Análise informando a leitura dos editais.

### Tarefa 5: Validação Automatizada e Navegador
- Rodar suíte completa de testes no Vitest (324+ testes).
- Executar teste no navegador validando a UI e o carregamento imediato.
