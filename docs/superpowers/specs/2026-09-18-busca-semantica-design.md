# Busca semântica sobre licitações e editais — design

- **Data:** 2026-09-18
- **Status:** aprovado para implementação (aprovação delegada ao agente pelo solicitante)
- **Relacionado:** [`ADR-001`](../../architecture/adr-001-busca-vetorial.md), critérios C08, C11, R04 do arquivo 05

## 1. Problema

A busca do catálogo é lexical: `ILIKE` sobre `busca_texto` unido por `OR` a
`websearch_to_tsquery('portuguese')` sobre `objeto_fts`. Ela acha o que o usuário
digitou, não o que ele quis dizer. "Reforma de escola" não encontra "manutenção
predial em unidade de ensino", embora sejam a mesma oportunidade.

Além disso, o catálogo conhece os documentos das licitações apenas de nome: a
tabela `documentos_licitacao` guarda `nome`, `tipo_documento` e `url`, e **nenhum
byte de edital jamais foi baixado**. Todo o conteúdo que descreve o que está
sendo licitado — objeto detalhado, quantidades, exigências de habilitação,
prazos — está fora do alcance da busca.

## 2. Evidências medidas (2026-09-18)

Todas as decisões abaixo se apoiam em medição contra a fonte real, não em
estimativa.

**Volume atual:** 7.713 licitações, 1.425 documentos catalogados (metadados).

**Download no PNCP:**

- `content-type` é **sempre** `application/octet-stream`. O tipo real só existe
  no cabeçalho `content-disposition` (`filename="EDITAL+DL+49-2026.pdf"`).
  Detectar tipo pelo `content-type` produz classificação inútil.
- Tamanhos variam em ordens de grandeza: 392 KB baixados em 0,85 s e
  10,9 MB em 15,2 s, nos dois primeiros documentos sorteados. Sem teto de bytes,
  um único anexo pode consumir o tick inteiro — é o critério R04, hoje em aberto.

**Extração de texto** (biblioteca `unpdf`, sobre os mesmos dois arquivos):

| arquivo | páginas | tempo | densidade |
|---|---|---|---|
| 392 KB | 38 | 684 ms | 2.726 chars/página |
| 10,9 MB | 47 | 1.581 ms | 1.300 chars/página |

Os dois têm camada de texto real. A extração é barata perto do download.

**Embedding** (`bge-m3` via Ollama local): 1024 dimensões; 6,9 s na primeira
chamada (carga do modelo em memória) e ~123 ms por texto em lote depois.

Teste de separação semântica, consulta `"reforma de escola municipal"`:

| candidato | similaridade cosseno |
|---|---|
| recuperação de prédio escolar | 0,5549 |
| manutenção predial em unidade de ensino | 0,5145 |
| pavimentação asfáltica | 0,4311 |
| aquisição de medicamentos | 0,3756 |

A ordem é a correta, e reproduz o exemplo que a própria ADR-001 usou para
descrever a hipótese não medida. Isto é evidência inicial de viabilidade, **não**
o experimento de relevância que a ADR exige (ver §8).

## 3. Relação com a ADR-001

A ADR-001, de 2026-09-18, decidiu **não adotar pgvector no caminho de produção**
e listou oito critérios de aprovação antes de qualquer rollout. Este design não
revoga essa decisão; ele constrói exatamente o que a ADR descreve como caminho
legítimo:

- a busca vetorial entra **como reordenação híbrida**, nunca substituindo o
  lexical;
- os filtros de elegibilidade continuam sendo aplicados pelo PostgreSQL;
- a feature flag nasce **desligada**, e o lexical permanece como caminho de
  rollback;
- cada embedding carrega modelo, versão e origem textual;
- o arsenal de medição que a ADR exige é entregue junto com o código.

O que este design **não** faz, e não pode fazer sozinho: declarar os gates
cumpridos. Os critérios 3 (ganho de relevância de 10%) e parte do 7 dependem de
julgamento humano sobre consultas reais, com dois avaliadores e resolução de
divergência por consenso. O código entrega o instrumento; o julgamento é da
equipe.

## 4. Arquitetura

Quatro unidades independentes, cada uma com uma responsabilidade e uma interface
testável em isolamento.

```
PNCP /arquivos/{n}  ──►  [A] worker de bytes  ──►  documentos_arquivo (texto extraído)
                                                          │
licitacoes.objeto  ──────────────────────────────►  [B] worker de embeddings
                                                          │
                                                          ├──► licitacoes_embedding
                                                          └──► documento_chunks
                                                                    │
consulta do usuário ──► [C] busca híbrida (RRF) ◄──────────────────┘
                              │
                              └──► [D] harness de experimento (ADR §Métricas)
```

### [A] Worker de bytes e extração

Espelha `worker.documentos.server.ts`: fila em Postgres, reserva com lease,
rede fora da transação, tick com orçamento, retomável. Invariantes herdadas.

Tabela nova `documentos_arquivo` (1:1 com `documentos_licitacao`):

| coluna | papel |
|---|---|
| `documento_id` | PK, FK para `documentos_licitacao` |
| `licitacao_id` | desnormalizado, para filtrar sem join na busca |
| `estado` | `pendente` \| `baixando` \| `extraido` \| `sem_texto` \| `grande_demais` \| `erro` |
| `nome_arquivo`, `extensao`, `mime_detectado` | tipo real, do `content-disposition` + magic bytes |
| `bytes` | tamanho baixado |
| `sha256` | identidade do conteúdo; evita re-extrair o que não mudou |
| `paginas`, `chars`, `densidade_chars_pagina` | base da decisão `sem_texto` |
| `texto` | texto extraído, normalizado |
| `tentativas`, `erro`, `atualizado_em` | operação |

Decisões:

- **Teto de bytes (R04):** `DOCS_MAX_BYTES`, padrão 25 MB. O worker lê o
  `content-length` quando existe e aborta o corpo ao ultrapassar o teto mesmo
  quando não existe. Estado vira `grande_demais`, que é definitivo e não consome
  retentativa.
- **Tipo real:** ordem de precedência `content-disposition` → magic bytes →
  extensão do `nome` já catalogado. `application/octet-stream` é ignorado.
- **Formatos na v1:** PDF (`unpdf`). ZIP, DOC e DOCX são registrados com estado
  `erro` e motivo `formato_nao_suportado`, contabilizados à parte — visíveis, não
  silenciosos. Ampliar é trabalho futuro com dado sobre quanto do acervo é ZIP.
- **PDF escaneado:** densidade < 200 chars/página marca `sem_texto`. Não entra na
  fila de embedding e não polui o vetorial. Sem OCR na v1.
- **Bytes não são guardados.** O produto precisa do texto; o byte original
  continua disponível na URL oficial do PNCP. Guardar ~3 GB de PDF no Supabase
  não serve a nenhum requisito e estoura o plano.

### [B] Worker de embeddings

Interface `Embedder`, com duas implementações:

```ts
interface Embedder {
  readonly modelo: string;       // "bge-m3"
  readonly versao: string;       // hash/tag do modelo
  readonly dimensoes: number;    // 1024
  embed(textos: string[]): Promise<Float32Array[]>;
}
```

- `OllamaEmbedder` — padrão, `http://127.0.0.1:11434/api/embed`, sem chave, sem
  custo, roda onde a rotina noturna roda.
- `ApiEmbedder` — compatível com API estilo OpenAI, ativado apenas se
  `EMBEDDING_API_KEY` existir. Não é exercitado enquanto não houver chave.

Duas camadas de vetor, e a razão de serem duas:

- **`licitacoes_embedding`** — uma linha por licitação, sobre
  `objeto + orgao + municipio`. Cobre as 7.713 licitações imediatamente, sem
  depender do pipeline de download. É o que faz a busca semântica existir no
  primeiro dia.
- **`documento_chunks`** — trechos de ~1.500 chars com 200 de sobreposição,
  sobre o texto extraído. Cobre o conteúdo do edital.

Ambas guardam `modelo`, `versao_modelo`, `origem_texto` (hash do texto de
entrada) e `criado_em`. Mudança em `objeto`/`orgao` ou novo `sha256` de arquivo
enfileira recálculo — exigência direta da ADR.

**Teto de chunks por documento:** `EMBED_MAX_CHUNKS_DOC`, padrão 40. Um edital de
100 mil chars viraria ~70 chunks; os 40 primeiros cobrem objeto, dotação e
habilitação, que é onde a intenção de busca mora. Isto é controle de tamanho de
banco, e o padrão deve ser revisto com medição de onde os acertos caem.

**Tipo de coluna:** `halfvec(1024)`, metade do armazenamento de `vector(1024)`
com perda desprezível em recall nesta escala. Índice HNSW com
`halfvec_cosine_ops`.

### [C] Busca híbrida

Função nova `buscar_licitacoes_semantica`, e `buscar_licitacoes` ganha o
parâmetro `p_modo` (`'lexical'` padrão | `'hibrido'`). A assinatura atual
continua válida: chamadas existentes não mudam de comportamento.

Ordem das operações, que é o ponto que a ADR cobra:

1. aplicar **todos** os filtros relacionais (UF, município, modalidade, datas,
   valor, status, prioridade) — produz o conjunto elegível;
2. dentro dele, calcular o ranking lexical e o ranking vetorial;
3. fundir por **RRF** (`score = Σ 1/(k + posição)`, k=60), pesos versionados em
   constante nomeada;
4. devolver top-N com o trecho que casou, quando a origem foi um chunk.

Pré-filtrar antes do vetor é o que garante "top-10 completo quando existirem
candidatos elegíveis suficientes". Quando o conjunto elegível for pequeno
(< `HIBRIDO_LIMIAR_EXATO`, padrão 5.000), a distância é calculada de forma exata
sobre o subconjunto, sem HNSW — mais rápido e sem perda de recall nessa faixa.

**Feature flag:** tabela `configuracao_busca` de linha única
(`id` fixo em `1` com `check (id = 1)`, `hibrido_ativo boolean not null default
false`, `peso_lexical`, `peso_vetorial`, `modelo_esperado text`,
`atualizado_em`). Ler a flag do banco, e não de env, é o que permite desligar sem
deploy — requisito de rollback da ADR. `modelo_esperado` existe para a busca se
recusar a fundir vetores gerados por outro modelo. Com a flag desligada, o
caminho lexical é byte-a-byte o de hoje.

**Fallback:** qualquer falha do `Embedder` (serviço fora, timeout, dimensão
inesperada) cai para lexical, registra o evento e não devolve erro ao usuário.

### [D] Harness de experimento

`scripts/experimento-busca.mjs`, no molde do `benchmark-pipeline.mjs` existente:

- baseline exato (sem índice) vs HNSW, mesmo snapshot, mesma função de distância;
- `recall@10` do HNSW contra o exato, agregado e por segmento de filtro;
- latência p50/p95/p99 no cliente e no Postgres, após aquecimento, ≥100 execuções;
- cobertura de embeddings (válidos / pesquisáveis), com registros de dimensão
  errada ou modelo antigo contados à parte;
- completude sob filtros: toda consulta com ≥10 candidatos elegíveis devolve 10;
- falhas e timeouts reportados junto, nunca escondidos atrás de percentis.

Entrega junto um `docs/superpowers/specs/consultas-avaliacao.json` com consultas
representativas semeadas a partir do vocabulário real do catálogo, e o formato do
arquivo de julgamento. **Os julgamentos ficam vazios**: preenchê-los é trabalho
humano, e o gate de relevância permanece não cumprido até isso acontecer.

## 5. Interface

O campo de busca ganha um seletor de modo, visível apenas quando a flag está
ligada. Resultado vindo de chunk mostra o trecho que casou, com a origem
("Edital, pág. 12"). Sem a flag, a tela é a de hoje.

## 6. Testes

TDD, com o padrão de portas já usado no repositório:

- **Unidade, sem rede:** detecção de tipo (precedência dos três sinais), teto de
  bytes, decisão `sem_texto`, chunking (fronteiras, sobreposição, teto),
  `Embedder` falso com dimensão fixa, fusão RRF com rankings conhecidos.
- **Contrato:** fixtures dos dois PDFs medidos hoje, com assinaturas e tamanhos
  reais, para travar as premissas de `content-disposition` e densidade.
- **Oráculo independente (C11 e §Teste de equivalência do arquivo 05):** a
  fusão RRF é verificada contra uma implementação de referência escrita no teste
  a partir da definição, não copiada do código de produção.
- **Integração contra o banco:** exercitar cada função SQL logo após aplicar a
  migração — a lição registrada na Fase 4, que pegou o `42702`.

## 7. Migração e operação

Uma migração `supabase/migrations/20260918150000_busca_semantica.sql` e o
`supabase/APLICAR-BUSCA-SEMANTICA.sql` correspondente, em UTF-8, para colar no
SQL Editor — o CLI não conecta nesta rede (`LegacyDbConfigIpv6Error`).

Ordem obrigatória: `create extension vector` → tabelas → funções → índices HNSW
**fora do caminho crítico**, depois da carga inicial, porque construir HNSW sobre
tabela vazia e depois inserir é mais lento e produz grafo pior.

Novos scripts: `npm run baixar:documentos`, `npm run gerar:embeddings`,
`npm run experimento:busca`.

## 8. Riscos

| risco | mitigação |
|---|---|
| Plano Supabase estourar com vetores | `halfvec`, teto de chunks, medição do tamanho antes do backfill completo |
| Ollama não disponível onde a busca roda (deploy Cloudflare) | Flag desligada + fallback lexical: a ausência do provedor degrada, não quebra |
| Fonte instável durante backfill de 1.425 downloads | Fila retomável, backoff já existente, teto de bytes |
| Vetorial parecer melhor sem ser | Gates da ADR, e nenhum julgamento fabricado |
| Carga inicial longa (~1,6 h de download + ~1 h de embedding) | Tick com orçamento; roda em janelas sucessivas sem perder progresso |

## 9. Fora de escopo

OCR de PDF escaneado; ZIP/DOCX; reranking por cross-encoder; embeddings de
itens da licitação; busca semântica multi-idioma; substituir o lexical.
