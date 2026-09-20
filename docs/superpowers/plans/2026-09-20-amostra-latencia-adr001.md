# Ampliar a amostra de latência do harness da ADR-001

## Contexto

A ADR-001 exige latência medida com **≥ 100 execuções**, após aquecimento. O
harness (`scripts/experimento-busca.mjs`) executa **uma** vez cada uma das 12
consultas de `docs/superpowers/specs/consultas-avaliacao.json` — 12 amostras.
Com amostra tão pequena, o p95 é o pior caso isolado, e o próprio relatório
avisa isso.

Isso não é detalhe formal. Em 20/09/2026 o harness reportou p95 de 5.091 ms com
p50 de 352 ms: onze consultas entre 106 e 430 ms e uma décima segunda que era o
primeiro acesso ao índice HNSW carregando o grafo do disco. Depois de aquecer o
banco, a mesma medição deu p95 de 414 ms. Um único valor movia o veredito do
gate 4 inteiro.

Falta também saber **qual** consulta é lenta: o relatório guarda latência
agregada, não por consulta. Descobrir isso hoje exigiu escrever um script
separado.

Estado atual: `HIBRIDO_LIMIAR_EXATO` implementado e aplicado ao banco
(`20260920120000_limiar_exato_hibrida.sql`), p95 de 414 ms contra meta de
300 ms, flag `hibrido_ativo` desligada. Branch `fix/latencia-busca-hibrida`.

## Objetivo

O harness passa a medir ≥ 100 execuções e a reportar latência por consulta, para
que o critério 4 da ADR seja avaliado com amostra defensável em vez de um
outlier.

## Global Constraints

- **Não alterar a função SQL nem qualquer migração.** Este trabalho é sobre o
  instrumento de medição, não sobre a busca.
- **Não ligar `configuracao_busca.hibrido_ativo`.** A flag é responsabilidade do
  controlador da sessão, que a liga e desliga em volta da medição.
- **Nenhuma medição contra serviços locais pelo subagente.** Ollama e Supabase
  são alcançados apenas pela sessão principal; o subagente escreve o código e
  roda os testes unitários, nada mais.
- O relatório existente já é lido por humanos e gravado em
  `logs/experimento-busca-AAAA-MM-DD.json`: campos atuais não podem sumir, só
  ganhar companhia.
- Português nos comentários e nas mensagens, como no resto do projeto.
- `npx tsc --noEmit` e `npm test` têm de continuar limpos.

## Task 1 — amostra ≥ 100 e latência por consulta

**Arquivos:** `scripts/lib/estatistica.mjs` (novo),
`scripts/lib/estatistica.test.mjs` (novo), `vitest.config.ts`,
`scripts/experimento-busca.mjs`.

### 1. Módulo de estatística testável

Criar `scripts/lib/estatistica.mjs` exportando:

- `percentil(valores, p)` — mover a função que hoje vive dentro de
  `experimento-busca.mjs`, com o mesmo comportamento: lista vazia devolve
  `null`; índice `Math.min(len - 1, Math.ceil((p / 100) * len) - 1)`, nunca
  negativo.
- `resumoLatencia(amostras)` — recebe uma lista de números e devolve
  `{ amostras, p50, p95, p99, min, max, media }`. Com lista vazia, devolve
  `{ amostras: 0 }` e os demais campos `null`. `media` arredondada para
  inteiro.

Criar `scripts/lib/estatistica.test.mjs` cobrindo, com `vitest`:

- lista vazia em ambas as funções;
- um único valor (p50 = p95 = p99 = esse valor);
- lista conhecida onde o percentil é verificável à mão, por exemplo
  `[100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]`: p50 = 500, p95 = 1000,
  p99 = 1000;
- que `resumoLatencia` não depende da ordem de entrada (mesma lista embaralhada
  produz o mesmo resumo);
- que um outlier único em 100 amostras **não** domina o p50 — é exatamente o
  defeito que motivou esta tarefa.

Para os testes rodarem, acrescentar `"scripts/**/*.test.mjs"` ao `include` de
`vitest.config.ts`, preservando o padrão atual de `src`.

### 2. Repetições no harness

Em `scripts/experimento-busca.mjs`:

- Constante `REPETICOES`, lida de `process.env.EXPERIMENTO_REPETICOES`, padrão
  **9**. Com as 12 consultas do arquivo de avaliação, 9 × 12 = 108 execuções,
  acima do mínimo de 100 exigido pela ADR.
- Cada consulta é executada `REPETICOES` vezes **na fase de latência**. O
  embedding da consulta é gerado UMA vez e reaproveitado nas repetições: medir o
  Ollama de novo a cada repetição mediria outra coisa, e o relógio do harness
  cobre só a RPC.
- Os aquecimentos existentes (modelo e banco) permanecem como estão, antes de
  qualquer medição.
- As comparações lexical × híbrido e a completude continuam sendo avaliadas
  **uma vez por consulta**, não por repetição: elas são sobre conteúdo, não
  sobre tempo, e repeti-las só multiplicaria chamadas.

### 3. Relatório

Em `relatorio.latencia_ms`, manter `amostras`, `p50`, `p95`, `p99` e acrescentar
`repeticoes_por_consulta`, `min`, `max` e `media`.

O campo `aviso` passa a ser condicional:

- amostras < 100 → texto atual, dizendo que a ADR pede ≥ 100;
- amostras ≥ 100 → `null` (ausência de aviso é a informação).

Acrescentar `relatorio.latencia_por_consulta`: uma entrada por consulta com
`id`, `texto` e o resumo de `resumoLatencia` daquelas repetições. É o que
permite identificar a consulta lenta sem escrever outro script.

No resumo impresso no terminal, além do p95/p99 atual, imprimir as **três
consultas mais lentas por p95**, no formato `id | texto | p95 ms`.

### 4. Verificação do subagente

- `npx tsc --noEmit` limpo.
- `npm test` limpo, incluindo os novos testes de `scripts/lib/estatistica.test.mjs`.
- **Não executar** `npm run experimento:busca`: ele exige Ollama e Supabase, que
  o subagente não alcança. A execução real é do controlador.

## Depois das tarefas (controlador, não delegável)

1. Ligar `hibrido_ativo`, rodar `npm run experimento:busca` com a amostra
   ampliada, desligar a flag.
2. Registrar na ADR-001 o p95 com amostra ≥ 100 e o veredito do critério 4.
3. Atualizar a memória do projeto com o número final.
