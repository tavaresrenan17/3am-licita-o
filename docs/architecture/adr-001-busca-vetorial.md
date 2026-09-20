# ADR-001: Adiar pgvector e validar busca semântica por experimento

- **Status:** aceito
- **Data:** 2026-09-18
- **Responsáveis:** equipe 3AM Licitação

## Contexto

A busca do catálogo usa PostgreSQL com filtros relacionais, `tsvector` em português e trigramas. O produto pesquisa palavras-chave, modalidade, UF, município, data de publicação e faixa de valor. Não existem hoje extensão `vector`, embeddings, coluna vetorial ou índice HNSW/IVFFlat no projeto.

Adicionar pgvector agora não reduziria a latência da coleta no PNCP e também não aceleraria filtros exatos. Ele poderia melhorar consultas semânticas, como aproximar “reforma de escola” de “manutenção predial em unidade de ensino”, mas essa hipótese ainda não foi medida com buscas reais e resultados julgados relevantes.

## Decisão

Não adotar pgvector no caminho de produção neste momento. A busca lexical e os filtros relacionais permanecem como baseline. Uma busca vetorial só poderá ser adicionada como reordenação híbrida, depois de passar pelo protocolo abaixo. Os filtros de elegibilidade — licitação aberta, prazo disponível, UF, município, modalidade, datas e valores — continuam sendo aplicados pelo PostgreSQL.

Essa decisão evita o custo de geração e atualização de embeddings sem evidência de ganho, mantém explicabilidade por palavra-chave e concentra o trabalho imediato nos gargalos medidos da API e do banco.

## Evidências atuais

- O repositório não contém implementação vetorial funcional.
- A busca atual cobre os campos e filtros expostos pela interface.
- A maior parte do tempo de sincronizações observadas está na API do PNCP, e não na busca do catálogo.
- Não existe conjunto de relevância capaz de comparar com segurança busca lexical e semântica.
- Índices aproximados podem devolver menos de `k` resultados quando filtros são aplicados depois da busca vetorial. O experimento precisa medir esse comportamento, e não apenas a consulta sem filtros.

## Experimento exigido

### Dataset e ground truth

1. Extrair uma amostra versionada e anonimizada do catálogo, contendo `id`, objeto, órgão, município, UF, modalidade, datas, valor e estado de abertura. A amostra deve refletir a distribuição real e incluir oportunidades raras e textos curtos.
2. Coletar no mínimo 100 consultas reais ou representativas da equipe. Incluir sinônimos, siglas, erros de digitação e combinações com UF, município, modalidade e faixa de valor.
3. Para cada consulta, dois avaliadores devem julgar candidatos numa escala de 0 a 3: irrelevante, relacionado, relevante e resultado ideal. Divergências devem ser resolvidas por consenso, sem revelar qual mecanismo produziu o resultado.
4. Congelar consultas, julgamentos, versão do catálogo, modelo de embedding e parâmetros do índice. O conjunto de ajuste e o conjunto final de avaliação devem ser separados.

### Cobertura e consistência

- Pelo menos **99%** das licitações pesquisáveis devem possuir embedding válido.
- Registros sem embedding, com dimensão incorreta ou gerados por versão antiga devem ser contabilizados separadamente.
- A origem textual e a versão do modelo devem acompanhar cada embedding. Mudanças em objeto, órgão ou campos incorporados devem enfileirar novo cálculo.
- A busca lexical precisa continuar atendendo registros ainda não vetorizados durante reprocessamento ou falhas do provedor.

### Baseline exato

Antes de criar HNSW, executar a distância vetorial exata, sem índice aproximado, no mesmo snapshot. Esse resultado é a referência para medir o índice e deve usar o mesmo pré-filtro e a mesma função de distância da alternativa avaliada.

Para cada consulta, registrar:

- top 10 lexical;
- top 10 vetorial exato;
- top 10 híbrido, com fórmula e pesos versionados;
- relevância julgada, latência e quantidade de candidatos após os filtros.

### Métricas

- **Cobertura de embeddings:** registros válidos / registros pesquisáveis, mínimo de 99%.
- **Recall@10 do HNSW:** interseção entre o top 10 aproximado e o top 10 exato / 10, agregado por consulta. Meta mínima de 0,95 e nenhum segmento importante abaixo de 0,90.
- **NDCG@10 ou MRR:** a busca híbrida deve superar o baseline lexical em pelo menos 10% no conjunto final, com melhora ou empate nos segmentos críticos.
- **Latência:** medir p50, p95 e p99 no cliente e no PostgreSQL após aquecimento, com pelo menos 100 execuções por cenário. A meta inicial é p95 de até 300 ms e p99 de até 600 ms para top 10 no volume de produção projetado.
- **Completude sob filtros:** toda consulta com pelo menos 10 candidatos elegíveis deve devolver 10 itens. Medir separadamente UF, município, modalidade, intervalo de datas, faixa de valor e combinações desses filtros.
- **Custo:** registrar tempo e preço da geração inicial, reprocessamento diário, armazenamento, crescimento do índice, CPU, memória e duração de manutenção/reindexação.

Os relatórios devem informar também falhas e timeouts. Percentis calculados somente sobre sucessos não podem ocultar a taxa de erro.

### Configuração HNSW candidata

Se o baseline exato justificar o vetor, criar o índice HNSW fora do caminho crítico e testar mais de uma combinação de `m`, `ef_construction` e `hnsw.ef_search`. Índices relacionais devem atender os filtros associados. O plano precisa ser verificado com `EXPLAIN (ANALYZE, BUFFERS)` para confirmar uso do HNSW e identificar filtros aplicados depois da busca aproximada.

Quando o filtro reduzir fortemente o conjunto, comparar pré-filtragem, consulta exata no subconjunto e varredura iterativa do HNSW. A configuração escolhida deve preservar top 10 completo e recall, sem depender apenas de latência média.

## Critérios de aprovação

A busca híbrida só pode entrar em produção quando todos os itens forem atendidos:

1. cobertura de embeddings de pelo menos 99%;
2. recall@10 do HNSW de pelo menos 0,95 contra o baseline exato;
3. ganho de relevância de pelo menos 10% no conjunto final, sem regressão material nos segmentos críticos;
4. p95 e p99 dentro das metas sob os filtros usados pelo app;
5. top 10 completo quando existirem candidatos elegíveis suficientes;
6. custo mensal estimado e processo de atualização aceitos pela equipe;
7. fallback lexical testado e observabilidade de cobertura, erros, latência e versão do modelo;
8. rollout gradual por feature flag, começando com tráfego interno.

## Rollback

O lexical permanece disponível e é o caminho de rollback. Desativar a feature flag se, por duas janelas consecutivas, ocorrer qualquer um destes eventos:

- cobertura abaixo de 99%;
- p95 acima de 500 ms ou p99 acima de 1 s;
- taxa de erro acima de 1%;
- top 10 incompleto em mais de 1% das consultas elegíveis;
- queda de relevância reportada e confirmada no conjunto de regressão;
- custo operacional acima do limite aprovado.

O rollback não remove dados imediatamente. Primeiro interrompe a leitura vetorial e mantém a busca lexical; embeddings e índice só são removidos depois da análise, em migração reversível e separada.

## Consequências

A experiência atual continua previsível e com menor custo operacional. Consultas puramente semânticas podem continuar limitadas até que haja evidência suficiente. Em compensação, uma futura adoção de pgvector terá baseline, critérios de qualidade, limites de custo e retorno seguro definidos antes do rollout.

## Estado da implementação (2026-09-18)

A infraestrutura descrita em "Experimento exigido" foi construída: pipeline de
download e extração de editais, embeddings em duas camadas (`bge-m3`, 1024
dimensões, Ollama local), busca híbrida por RRF com pré-filtragem relacional e
harness de medição (`npm run experimento:busca`).

**A decisão desta ADR permanece em vigor.** `configuracao_busca.hibrido_ativo`
nasce `false` e o caminho de produção continua lexical. Os gates 1, 4 e 5 são
medidos automaticamente pelo harness; o gate 3 (ganho de relevância de ao menos
10%) exige as 100 consultas julgadas por dois avaliadores descritas acima e
**não está cumprido** — `docs/superpowers/specs/consultas-avaliacao.json` nasce
com os julgamentos vazios de propósito. Ligar o híbrido antes disso contraria
esta ADR.

Medições feitas contra as fontes reais em 18/09/2026, que a decisão original não
tinha: `bge-m3` separa corretamente o próprio exemplo desta ADR (0,5549 para
"recuperação de prédio escolar" contra 0,3756 para "aquisição de medicamentos",
consultando "reforma de escola municipal"); os editais amostrados têm camada de
texto (1.300 e 2.726 chars/página); e o teto de 40 chunks por documento corta
30-40% do texto de 100% da amostra, porque os editais reais têm 60 a 104 mil
caracteres. Esse último número é o principal candidato a revisão.

## Situação dos critérios em 20/09/2026

Medido, não estimado. A infraestrutura está completa e carregada; os critérios
foram exercitados contra o catálogo real (8.792 licitações e 509 editais
vetorizados, 10.424 chunks).

| # | critério | situação |
|---|---|---|
| 1 | cobertura ≥ 99% | **cumprido** — 8.792 de 8.792, 100% |
| 2 | recall@10 do HNSW ≥ 0,95 | **inaplicável** — ver abaixo |
| 3 | ganho de relevância ≥ 10% | em aberto, e já não é o que bloqueia |
| 4 | p95/p99 nas metas | **337 ms** contra meta de 300 ms, amostra de 108 — era 9.287 ms; ver abaixo |
| 5 | top-10 completo sob filtros | **cumprido** — 0 consultas incompletas |
| 6 | custo aceito | custo de API é **zero** (Ollama local) |
| 7 | fallback testado + observabilidade | fallback coberto por teste; observabilidade contínua ainda não existe |
| 8 | rollout por flag | mecanismo pronto, nunca exercitado em produção |

### O critério 4 reprovou, e por uma margem que não se negocia

Medição de 20/09/2026, três execuções por consulta, descartando a primeira:

    p50 = 545 ms    p95 = 9.287 ms    máximo = 9.867 ms    meta de p95 = 300 ms

Não é aquecimento e não é a fonte estar lenta. As mesmas consultas, no caminho
lexical, levam de 99 a 744 ms — o híbrido é **30 a 50 vezes mais lento** que o
lexical sobre os mesmos dados:

| consulta | lexical | híbrido |
|---|---|---|
| serviços de vigilância patrimonial | 237–744 ms | 9.000–9.867 ms |
| reforma ou ampliação | 128–203 ms | 8.415–8.622 ms |

A ironia que fecha o diagnóstico: **a consulta mais lenta é exatamente a que
justifica o recurso.** "Serviços de vigilância patrimonial" devolve zero
resultados no lexical e quatro corretos no híbrido — e leva nove segundos.

### Os critérios 2 e 4 têm a mesma causa raiz

O critério 5 exige top-10 completo sob filtros, e para garanti-lo a
implementação aplica **todos** os filtros relacionais antes da busca vetorial.
Pré-filtrar assim impede o uso do índice aproximado: os dois índices HNSW
existem e não servem a consulta nenhuma. Daí o critério 2 não ter o que
comparar, e daí o custo do critério 4 — toda consulta faz varredura exata sobre
8.792 vetores de objeto e 10.424 chunks.

A especificação previa a saída: `HIBRIDO_LIMIAR_EXATO`, que usaria distância
exata só quando o conjunto elegível fosse pequeno e o índice quando fosse
grande. Ela nunca foi implementada, e foi registrada como lacuna consciente na
época. É ela que falta.

### O limiar exato foi implementado, e o critério 4 caiu de 9.287 ms para 337 ms

Medição de 20/09/2026, depois de `20260920120000_limiar_exato_hibrida.sql`:

    amostra de 12    p50 = 352 ms    p95 = 414 ms    meta de p95 = 300 ms
    amostra de 108   p50 = 149 ms    p95 = 337 ms    p99 = 428 ms

A segunda linha é a que vale: 108 execuções, 9 por consulta, a amostra ≥ 100 que
esta ADR exige — e ela foi cumprida. As três mais lentas pelo pior caso de 9
execuções são "coleta de lixo urbano" (474 ms), "software de gestão" (428 ms) e
"aquisição de medicamentos" (426 ms), com zero falhas. Com 9 repetições,
nearest-rank dá k = ceil(0,95 × 9) = 9 de 9: esses três números são o maior
valor de cada consulta, não um p95 com sentido estatístico — só o rótulo estava
errado, os números continuam corretos.

A queda de 414 ms para 337 ms não se explica pelo tamanho da amostra: o p50
caiu de 352 ms para 149 ms, e tamanho de amostra muda qual estatística de ordem
se lê, não a tendência central. A causa é metodológica — as 9 repetições por
consulta são consecutivas, sobre a mesma consulta e o mesmo embedding, com os
buffers do Postgres já segurando aquele working set. O que 149 ms mede é
latência de repetição quente, não a latência de uma consulta nova chegando fria.
A amostra ≥ 100 que esta ADR exige foi cumprida, mas o número é o melhor caso de
cache quente: para tráfego de consultas variadas, sem repetição consecutiva da
mesma busca, a lacuna até a meta de 300 ms pode ser maior que os 37 ms que a
linha de baixo sugere. A observação sobre a amostra de 12 continua verdadeira —
seu p95 era mesmo o pior caso isolado —, só que isso explica a diferença entre
as duas linhas em parte, não sozinho.

A função passou a contar os elegíveis e escolher a estratégia: até
`configuracao_busca.limiar_exato` (5.000) pré-filtra e varre o subconjunto;
acima disso busca os 600 vizinhos mais próximos pelo HNSW sobre a tabela inteira
e só então cruza com o filtro relacional. O resultado devolve
`estrategia_vetorial` e `elegiveis`, porque acima do limiar a completude do
top-10 deixa de ser garantida — a troca que a spec §4[C] autoriza.

Dois defeitos foram corrigidos junto, e o segundo estava no instrumento:

- `melhor_chunk` fazia `distinct on` sobre os 10.424 chunks **sem limite algum**;
- o harness media o primeiro acesso ao HNSW, que carrega o grafo do disco. Isso
  sozinho produzia p95 de 5.091 ms com p50 de 352 ms: onze das doze consultas
  ficavam entre 106 e 430 ms, e a décima segunda era carregamento de índice. Esta
  ADR pede latência "após aquecimento" — o harness aquecia o modelo e não o
  banco. Agora aquece os dois.

Latência por consulta depois da mudança, primeira checagem com as mesmas 12 do
harness: RPC entre 106 e 430 ms, contra 8.415–9.867 ms antes. "Serviços de
vigilância patrimonial", que devolve zero no lexical e quatro corretos no
híbrido, responde em 152 ms. A checagem seguinte, com amostra de 108, encontrou
consultas até 474 ms — a faixa de 106 a 430 ms era apenas o que 12 execuções
tinham revelado até então, não o teto real.

### Decisão

**A decisão original desta ADR permanece em vigor**, e o motivo mudou de lugar.
O critério 4 deixou de ser um abismo: 337 ms contra 300 ms de meta, com amostra
de 108, na mesma ordem de grandeza. Duas coisas seguem valendo:

1. **337 ms não é 300 ms.** A amostra agora tem 108 execuções, como esta ADR
   exige, então o número é defensável — e o que ele diz é que faltam 12% para a
   meta. O gate 4 continua não cumprido, por pouco e com dado sólido.
2. **O gate 3 continua sem um único julgamento humano.** Ligar o híbrido sem ele
   contraria esta ADR, e a latência ter melhorado não muda isso.

O que o episódio ensina vale mais que o número: o gate 4 pegou um defeito real
de plano de consulta antes de chegar ao usuário, e investigá-lo revelou um
segundo defeito — no próprio instrumento de medição. **Medir sem aquecer o banco
teria condenado uma implementação correta.**

Próximo trabalho, nesta ordem:

1. Fechar os 37 ms que faltam no p95 — as três consultas mais lentas são o alvo
   — ou rever a meta de 300 ms com argumento: ela foi escolhida antes de existir
   qualquer medição desta busca.
2. Retomar o critério 3 com as 100 consultas julgadas — agora com a busca
   utilizável, que era a condição que faltava.

Duas observações medidas que não mudam a decisão mas informam a próxima:

- **Vetorizar os 509 editais comprou pouco até agora:** um resultado novo
  inequívoco em 12 consultas, porque os chunks cobrem 257 de 8.792 licitações
  (2,9%). O valor atual da busca semântica vem da camada de objeto, que está a
  100%. Reavaliar o limiar quando a cobertura documental passar de 20–25%: o
  ruído de preâmbulo jurídico já aparece em 0,45 e escala com a cobertura.
- **A consulta "aquisição de medicamentos" infla de 23 para 223 resultados** em
  0,40, dirigida pelo vetor de objeto e não pelos documentos. Limiar não
  resolve; é assunto separado.

A medição de latência com amostra de 108 está registrada nesta própria ADR, na
seção "O limiar exato foi implementado, e o critério 4 caiu de 9.287 ms para
337 ms", acima. `2026-09-19-medicao-limiar-com-documentos.md` trata de outro
assunto — a calibragem do limiar de distância — e sua medição de latência é a
de 12 amostras, superada pela de 108 aqui registrada.

## Referências

- [Supabase: Vector indexes](https://supabase.com/docs/guides/ai/vector-indexes)
- [Supabase: Going to production with embeddings](https://supabase.com/docs/guides/ai/going-to-prod)
- [pgvector: indexação, filtros e varreduras iterativas](https://github.com/pgvector/pgvector)
