# PNCP Performance and Search Improvement Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task.

**Goal:** Medir com precisão API, processamento e banco, corrigir gargalos comprovados da busca e estabelecer um critério objetivo para adoção futura de pgvector.

**Architecture:** O worker continuará usando checkpoints transacionais no Supabase e acesso paginado ao PNCP. A mudança adiciona cronômetros por fase e persistência compatível, um benchmark somente leitura e índices relacionais alinhados aos filtros. A busca permanece híbrida lexical (`tsvector` + trigram); vetores ficam atrás de um portão de qualidade documentado.

**Tech Stack:** TypeScript, Vitest, Node.js, PostgreSQL/Supabase, PostgREST, PNCP REST API.

---

### Task 1: Baseline reproduzível

**Files:**
- Create: `scripts/benchmark-pipeline.mjs`
- Modify: `package.json`
- Test: `scripts/benchmark-pipeline.test.mjs`

**Steps:**
1. Escrever testes para cálculo de percentis, classificação de erros e validação de configuração.
2. Executar o teste e confirmar a falha inicial.
3. Implementar runner com aquecimento, repetições, timeout, ordem embaralhada e saída JSON.
4. Incluir cenários PNCP de baixo impacto e cenários de busca Supabase somente leitura.
5. Executar testes do script e uma medição real curta.
6. Commit: `feat(perf): adicionar benchmark reproduzivel do pipeline`.

### Task 2: Telemetria por fase do worker

**Files:**
- Modify: `src/services/pncp/worker.server.ts`
- Modify: `src/services/pncp/repositorio.server.ts`
- Modify: `src/services/pncp/worker.test.ts`
- Create: `supabase/migrations/20260918120000_metricas_pipeline.sql`
- Create: `supabase/APLICAR-METRICAS-PIPELINE.sql`

**Steps:**
1. Adicionar testes que distinguem HTTP, transformação, payload e merge usando relógio controlado.
2. Confirmar que falham com a telemetria atual.
3. Adicionar acumuladores por fase sem alterar a semântica de checkpoint.
4. Estender a RPC de métricas com novos campos e manter tolerância à migração ainda não aplicada.
5. Persistir métricas ao final do tick e após páginas concluídas quando seguro, evitando perder todo o diagnóstico em interrupções.
6. Executar os testes focados e a suíte completa.
7. Commit: `feat(perf): medir fases da sincronizacao PNCP`.

### Task 3: Busca e segurança no PostgreSQL

**Files:**
- Create: `supabase/migrations/20260918130000_busca_segura_e_indices.sql`
- Create: `supabase/APLICAR-BUSCA-SEGURA-E-INDICES.sql`
- Modify: `scripts/verificar-banco.mjs`

**Steps:**
1. Acrescentar verificações read-only para a assinatura da busca e resposta sob filtros públicos.
2. Criar índices parciais/compostos para abertas por UF, município, modalidade por nome, publicação e valor, evitando duplicar índices já equivalentes.
3. Recriar apenas as funções privilegiadas necessárias com `search_path` fixo.
4. Preservar os contratos JSON e permissões existentes.
5. Validar a migração em transação e executar o verificador sem iniciar job quando já houver sincronização ativa.
6. Commit: `perf(db): alinhar indices e proteger funcoes de busca`.

### Task 4: Corrigir regressões e documentar decisão vetorial

**Files:**
- Modify: `src/services/pncp/worker.test.ts`
- Create: `docs/architecture/adr-001-busca-vetorial.md`
- Modify: `README.md`

**Steps:**
1. Tornar explícitos nos testes os intervalos que fazem parte de cada cenário.
2. Manter um teste separado para os padrões de produção atuais.
3. Documentar dataset, recall@10, cobertura, p95/p99, filtros e critério de aprovação para pgvector/HNSW.
4. Executar testes, lint e build.
5. Commit: `test(perf): estabilizar worker e registrar criterio vetorial`.

### Task 5: Revisão final

**Files:**
- Review: all files changed by Tasks 1–4

**Steps:**
1. Fazer revisão de aderência ao plano.
2. Fazer revisão de qualidade, segurança SQL e risco operacional.
3. Corrigir achados e repetir testes focados, suíte completa, lint e build.
4. Executar benchmark real curto e salvar o relatório fora do controle de versão ou em artefato ignorado.
5. Apresentar tempos medidos, limites da medição, conclusão sobre vetores e instrução única de rollout da migração.
