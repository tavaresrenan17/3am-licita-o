# Plano de Implementação - Análise com IA Setorizada, Padronizada e Definitivamente Salva

## 1. Visão Geral
O usuário solicitou que, ao gerar o relatório completo pelo botão "Analisar com IA":
1. O relatório seja **setorizado e padronizado por seções temáticas claras**, facilitando ao usuário entender:
   - 🚨 **Pontos de Atenção & Riscos Críticos** (pegadinhas, multas, vistorias, exigências rígidas)
   - ⭐ **Pontos Importantes & Oportunidades** (valores, adiantamentos, vantagens, escopo chave)
   - 📋 **Requisitos & Habilitação** (CAT/Acervo, patrimônio, certidões)
   - 📅 **Prazos & Cronograma** (datas limites de proposta, impugnação, esclarecimento)
   - ℹ️ **O que NÃO é Importante / Cláusulas Padrão** (formalidades triviais da Lei 14.133/21 que não afetam a decisão)
   - 🎯 **Veredito Executivo & Próximos Passos**
2. **Salvar permanentemente na licitação e impedir reexecução**:
   - Uma vez gerada a análise para a licitação, ela é salva e gravada definitivamente.
   - O botão "Regenerar" é removido.
   - Na licitação, o botão passa a ser **"Ver Análise com IA (Salva)"** com badge de relatório concluído, abrindo a análise salva instantaneamente sem custo de tokens/créditos.
   - No backend, a análise já concluída é blindada contra sobrescritas acidentais.

---

## 2. Tarefas de Implementação

### Tarefa 1: Contrato & Prompts da Análise (`contrato.ts` e `contexto.ts`)
- Atualizar `analiseResultadoSchema` em `src/services/analise/contrato.ts`:
  - Incluir `pontosAtencao` (ou mapeamento compatível com `riscos`)
  - Incluir `itensNaoImportantes` (array de `ItemCitavel` opcional com fallback)
- Atualizar `construirPromptAnalise` em `src/services/analise/contexto.ts`:
  - Orientar a IA a classificar explicitamente o que é crítico/atenção, o que é relevante/vantajoso e o que é praxe/não importante.

### Tarefa 2: Blindagem no Backend contra Regeração (`orquestrador.server.ts` & `repositorio.analise.server.ts`)
- Em `executarAnaliseLicitacao`: se a análise já estiver pronta (`cache.estado === 'pronta'`), retornar a análise salva sem reexecutar a chamada à OpenAI.

### Tarefa 3: Redesign e Setorização Visual do Relatório (`AnaliseLicitacaoSheet.tsx`)
- Remover o botão "Regenerar" quando a análise estiver pronta.
- Adicionar selo visual de "✓ Relatório salvo permanentemente nesta licitação".
- Renderizar seções setorizadas com cores semânticas de alta legibilidade:
  - Card Vermelho/Rose: **🚨 Pontos de Atenção & Riscos Críticos**
  - Card Esmeralda/Verde: **⭐ Pontos Importantes & Oportunidades**
  - Card Azul/Sky: **📋 Requisitos & Habilitação**
  - Card Roxo/Purple: **📅 Prazos & Datas Críticas**
  - Card Slate/Neutro: **ℹ️ O que NÃO é Importante (Cláusulas Padrão & Dispensáveis)** com aviso de que são burocracias de praxe
  - Card Primário: **🎯 Veredito Executivo & Próximos Passos**

### Tarefa 4: Atualização da Tela de Detalhes (`licitacoes.$id.tsx`)
- Integrar `useAnaliseLicitacao` no componente `DetalheLicitacao`.
- Quando a análise estiver pronta:
  - Botão no cabeçalho exibe **"Ver Análise com IA (Salva)"** com ícone `CheckCircle2` e estilo esmeralda.
  - Quando não gerada, exibe **"Analisar com IA"**.

### Tarefa 5: Testes e Validação
- Executar testes unitários com Vitest (`npx vitest run`).
- Validar via subagente de browser a visualização setorizada e a persistência na página da licitação.
