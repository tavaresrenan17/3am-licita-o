# Fontes, validações e limites da evidência

## 1. Data e escopo verificados

Pesquisa documental de 11/09/2026 para consumo de editais/contratações, com foco em oportunidades abertas. O manual API Consultas v1.0 possui 41 páginas e foi extraído integralmente. O OpenAPI de consulta de produção foi obtido diretamente e seus 12 GETs foram inventariados. O manual de integração atual v2.6 foi examinado no índice e nos capítulos pertinentes à leitura, domínios e ciclo de atualização; os módulos de escrita foram identificados para delimitar escopo. Não se afirma leitura integral de todas as versões históricas nem homologação de todas as operações da API.

A série de seis sondagens da API de consulta terminou em **2026-09-11T16:59:54.088Z**, equivalente a **13h59min54s de Brasília**. Foram GETs de leitura com recorte DF, página 1, normalmente 10 linhas. Não houve teste de carga, coleta nacional, acesso a Supabase, implementação ou aplicação de migrações.

## 2. Fontes oficiais PNCP

| ID | Fonte e versão | O que sustenta |
|---|---|---|
| P1 | [Página solicitada de manuais](https://www.gov.br/pncp/pt-br/pncp/copy_of_manuais) | Pontos de entrada de Integração e Dados Abertos/API Consultas. |
| P2 | [Swagger Consulta](https://pncp.gov.br/api/consulta/swagger-ui/index.html) e [OpenAPI JSON](https://pncp.gov.br/api/consulta/v3/api-docs), info.version 1.0 | Nomes de endpoints, parâmetros, obrigatoriedade, limites e schemas atuais. |
| P3 | [Manual API Consultas v1.0](https://www.gov.br/pncp/pt-br/pncp/copy_of_manuais/ManualPNCPAPIConsultasVerso1.0.pdf/@@display-file/file), 41 páginas | Identidade, domínios e semântica. Seções 6.3/6.4 tratam publicação/proposta; seção 6.4 informa horários de proposta em Brasília. |
| P4 | [Manual Integração atual v2.6](https://pncp.gov.br/manual/pt-br/latest/) e [histórico](https://pncp.gov.br/manual/pt-br/latest/historico_de_versoes/index.html), 31/08/2026 | Versão atual; domínios, leitura e manutenção. |
| P5 | [Manual Integração, página única](https://pncp.gov.br/manual/pt-br/latest/singlehtml/), especialmente §11.5 | Detalhe da contratação e abrangência da atualização global. |
| P6 | [Consulta de itens §11.13](https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_itens_de_uma_contratacao.html) | Rota de itens, campos e valores estimados sob sigilo. |
| P7 | [Histórico da contratação §11.19](https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_historico_da_contratacao.html) | Eventos de inclusão/retificação/exclusão; recurso por contratação. |
| P8 | [Situação da contratação §7.13](https://pncp.gov.br/manual/pt-br/latest/tabelas_de_dominio/situacao_da_contratacao.html) | Códigos 1 divulgada, 2 revogada, 3 anulada, 4 suspensa. |
| P9 | [Modalidades, GET público](https://pncp.gov.br/api/pncp/v1/modalidades) | Lista observada de 19 modalidades, em vez de enum antigo 1–14. |
| P10 | [Acesso ao PNCP §5](https://pncp.gov.br/manual/pt-br/latest/acesso_ao_pncp/index.html) | Consulta pública versus APIs de manutenção autenticadas. |
| P11 | [Versão 2.5 arquivada](https://pncp.gov.br/manual/pt-br/2.5/singlehtml/index.html) | Contexto da mudança para CNPJ alfanumérico; não substitui a v2.6. |

As páginas individuais do manual permitem localizar os assuntos sem depender de seções de versões antigas. `latest` é mutável. Ao implementar, registrar versão, data e snapshot usados.

## 3. Fontes oficiais Supabase/PostgreSQL

| Fonte | Uso no plano |
|---|---|
| [Supabase upsert](https://supabase.com/docs/reference/javascript/upsert), [PostgreSQL INSERT](https://www.postgresql.org/docs/current/sql-insert.html) | Escrita por lote, chave de conflito, merge condicional e cuidado com duplicação no lote. |
| [Importação Supabase](https://supabase.com/docs/guides/database/import-data) | Opção COPY/staging para carga muito grande; não necessária para toda ingestão. |
| [FTS](https://supabase.com/docs/guides/database/full-text-search), [controle FTS PostgreSQL](https://www.postgresql.org/docs/current/textsearch-controls.html), [pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html) | Filtros lexicais/substring e índices. |
| [Índices Supabase](https://supabase.com/docs/guides/database/postgres/indexes), [CREATE INDEX](https://www.postgresql.org/docs/current/sql-createindex.html) | Índices orientados a consultas e restrição de funções imutáveis. |
| [Range](https://supabase.com/docs/reference/javascript/using-modifiers-range), [Data API select](https://supabase.com/docs/reference/python/select), [LIMIT/OFFSET](https://www.postgresql.org/docs/current/queries-limit.html) | Limites de retorno, extremos inclusivos e custo de offsets. |
| [Broadcast](https://supabase.com/docs/guides/realtime/broadcast), [assinar mudanças](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes), [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes#scaling-postgres-changes) | Eventos por lote, autorização e escala. |
| [Queues](https://supabase.com/docs/guides/queues), [limites Edge Functions](https://supabase.com/docs/guides/functions/limits) | Persistência de trabalho e limites do runtime. |
| [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [API keys](https://supabase.com/docs/guides/getting-started/api-keys) | Isolamento e segredos no servidor. |
| [Tipos temporais PostgreSQL](https://www.postgresql.org/docs/current/datatype-datetime.html) | Instante, precisão, conversão e cursor temporal. |

As fontes documentam recursos e limites; os números operacionais sugeridos pelo plano (frequência, concorrência, timeout, lotes) são recomendações para calibração, não limites extraídos dessas páginas.

## 4. Sondagens executadas

Os tempos abaixo são de **uma execução por caso**. Não são percentis, SLA ou estimativa de capacidade. Totais informados pela fonte não significam que todas as páginas foram baixadas.

| Caso | Status | Linhas recebidas | Total informado | Páginas informadas | Tempo observado |
|---|---|---|---|---|---|
| proposta_sem_modalidade | 200 | 10 | 395 | 40 | 19.646 s |
| proposta_limite_51 | 400 | — | — | — | 0.128 s |
| publicacao_sem_modalidade | 400 | — | — | — | 0.034 s |
| publicacao_valida | 200 | 10 | 32 | 4 | 1.538 s |
| atualizacao_valida | 200 | 10 | 104 | 11 | 0.749 s |
| proposta_datafinal_hoje | 200 | 2 | 2 | 1 | 0.061 s |

### proposta_sem_modalidade

[URL da consulta executada](https://pncp.gov.br/api/consulta/v1/contratacoes/proposta?dataFinal=20261011&uf=DF&pagina=1&tamanhoPagina=10).

Amostra reduzida de campos públicos efetivamente retornados:

```json
[
  {
    "id": "33839275000172-1-000029/2024",
    "abertura": "2024-09-18T08:00:00",
    "encerramento": "2026-09-18T18:00:00",
    "publicacao": "2024-09-13T15:21:21",
    "atualizacao": "2024-12-27T20:45:02",
    "modalidade": 12,
    "situacao": 1,
    "uf": "DF"
  },
  {
    "id": "00037457000170-1-000021/2025",
    "abertura": "2026-07-02T08:00:00",
    "encerramento": "2026-09-25T09:00:00",
    "publicacao": "2025-09-18T07:28:53",
    "atualizacao": "2026-07-01T07:09:11",
    "modalidade": 4,
    "situacao": 1,
    "uf": "DF"
  }
]
```

### proposta_limite_51

[URL da consulta executada](https://pncp.gov.br/api/consulta/v1/contratacoes/proposta?dataFinal=20261011&uf=DF&pagina=1&tamanhoPagina=51).

Resposta de validação: `Tamanho de página inválido`.

### publicacao_sem_modalidade

[URL da consulta executada](https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?dataInicial=20260910&dataFinal=20260910&uf=DF&pagina=1&tamanhoPagina=10).

Resposta de validação: `Required request parameter 'codigoModalidadeContratacao' for method parameter type Long is not present`.

### publicacao_valida

[URL da consulta executada](https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?dataInicial=20260910&dataFinal=20260910&codigoModalidadeContratacao=6&uf=DF&pagina=1&tamanhoPagina=10).

Amostra reduzida de campos públicos efetivamente retornados:

```json
[
  {
    "id": "26989715000102-1-001386/2026",
    "abertura": "2026-09-10T08:00:00",
    "encerramento": "2026-09-24T10:00:00",
    "publicacao": "2026-09-10T04:00:02",
    "atualizacao": "2026-09-10T04:01:12",
    "modalidade": 6,
    "situacao": 1,
    "uf": "DF"
  },
  {
    "id": "00509968000148-1-002993/2026",
    "abertura": "2026-09-10T08:00:00",
    "encerramento": "2026-09-24T09:00:00",
    "publicacao": "2026-09-10T04:00:08",
    "atualizacao": "2026-09-10T04:01:20",
    "modalidade": 6,
    "situacao": 1,
    "uf": "DF"
  }
]
```

### atualizacao_valida

[URL da consulta executada](https://pncp.gov.br/api/consulta/v1/contratacoes/atualizacao?dataInicial=20260910&dataFinal=20260910&codigoModalidadeContratacao=6&uf=DF&pagina=1&tamanhoPagina=10).

Amostra reduzida de campos públicos efetivamente retornados:

```json
[
  {
    "id": "15126437000305-1-003431/2026",
    "abertura": "2026-09-10T08:00:00",
    "encerramento": "2026-09-22T09:30:00",
    "publicacao": "2026-08-27T04:01:34",
    "atualizacao": "2026-09-10T04:01:02",
    "modalidade": 6,
    "situacao": 1,
    "uf": "DF"
  },
  {
    "id": "00488478000102-1-000258/2026",
    "abertura": "2026-09-10T08:00:00",
    "encerramento": "2026-09-23T10:00:00",
    "publicacao": "2026-09-10T04:00:28",
    "atualizacao": "2026-09-10T04:01:03",
    "modalidade": 6,
    "situacao": 1,
    "uf": "DF"
  }
]
```

### proposta_datafinal_hoje

[URL da consulta executada](https://pncp.gov.br/api/consulta/v1/contratacoes/proposta?dataFinal=20260911&uf=DF&pagina=1&tamanhoPagina=10).

Amostra reduzida de campos públicos efetivamente retornados:

```json
[
  {
    "id": "00508903000188-1-000900/2026",
    "abertura": "2026-08-27T08:00:00",
    "encerramento": "2026-09-11T14:00:00",
    "publicacao": "2026-05-18T07:13:39",
    "atualizacao": "2026-08-27T07:09:15",
    "modalidade": 6,
    "situacao": 1,
    "uf": "DF"
  },
  {
    "id": "34028316000103-1-000023/2026",
    "abertura": "2026-08-19T09:00:00",
    "encerramento": "2026-09-11T14:00:00",
    "publicacao": "2026-08-18T18:31:05",
    "atualizacao": "2026-08-18T18:35:12",
    "modalidade": 6,
    "situacao": 1,
    "uf": "DF"
  }
]
```

Conclusões permitidas:

- Modalidade foi omitida com sucesso em proposta.
- Proposta com tamanho 51 foi rejeitada; o contrato também limita publicação/atualização a 50. Não foram feitos testes negativos repetidos nessas outras rotas.
- Publicação sem modalidade foi rejeitada.
- Atualização global existe e retornou dados, incluindo publicação anterior à janela de atualização consultada.
- Havia registros publicados em 2024/2025 entre propostas abertas observadas em 2026. Uma aquisição restrita a publicações recentes não cobriria esse conjunto.
- Alterar dataFinal mudou os totais observados de propostas, de forma compatível com horizonte de encerramento. Não provou inclusividade exata, tratamento de datas nulas ou cobertura de todos os prazos futuros.

Não foram verificadas por essas seis chamadas: segunda/última página, 204 real, 429, todos os filtros combinados, OR, todos os códigos de domínio, limite de intervalo de datas, exclusões, estabilidade temporal, assinatura de Realtime ou isolamento do Supabase. Esses casos estão no plano QA. A consulta de domínio de modalidades foi uma leitura documental adicional e não integra a série de seis sondagens da API de consulta.

## 5. Divergências e resolução

| Divergência | Evidência | Decisão para implementação |
|---|---|---|
| URL Swagger terminava em index.html.. | Endereço informado tinha pontuação extra. | Usar index.html. |
| Página/resultado legado aponta versão antiga | Índice atual encaminha ao manual HTML v2.6. | Preferir versão atual e registrar snapshot. |
| Manual menciona páginas de até 500 em contratações | OpenAPI máximo 50; rejeição de 51 em proposta. | 10–50 nas três listagens principais. |
| Modalidade em proposta contraditória no PDF | Texto opcional, tabela obrigatória; OpenAPI opcional e GET válido sem modalidade. | Opcional nessa rota. |
| PDF descreve parâmetros como cabeçalho | OpenAPI in=query e exemplos URL. | Query parameters. |
| Situação string no OpenAPI, número nas amostras | situacaoCompraId retornou número 1. | Normalização controlada sem rejeitar dado conhecido. |
| Tabela de modos de disputa repete outro endpoint | Manual §7.9 diverge do seu exemplo. | Verificar contrato ativo antes de usar; ver arquivo 08. |

## 6. Proveniência reproduzível

Hashes SHA-256 dos documentos obtidos para conferência, sem pressupor que novos downloads serão byte a byte idênticos:

- OpenAPI Consulta: `6d99e43e8a449b7cf9b6def3fddcc3c79a280268c3610d0ce8954bd66e442fec`.
- PDF Manual Consultas: `50ace96045a36025147a4a932ac2a13988688f284cf564a87a95a4d4bddb3df1`.

O arquivo 01 materializa a lista de capacidades do snapshot. Na implementação, gerar teste comparando parâmetros/obrigatoriedade/limites, em vez de comparar exemplos dinâmicos de datas ou depender exclusivamente do hash bruto.

## 7. Limites de escopo e próximos testes da implementação

O pacote não teve acesso ao repositório real do produto nem a um projeto Supabase configurado. Nomes de tabelas, SQL, fila e limites operacionais são propostas adaptáveis. Nenhuma promessa de tempo de consulta local foi homologada.

O limite por segundo do PNCP, suporte a GET condicional, intervalo máximo de datas, consistência de paginação sob atualização e entrega de exclusões não foram estabelecidos pelas fontes consultadas. Esses pontos não devem virar fatos inventados pela LLM. Em especial, limites/envelopes de alguns recursos de enriquecimento da API Integração precisam de confirmação no adaptador antes da homologação, conforme arquivo 08.

Critérios completos: [05_QA_E_CRITERIOS_DE_ACEITE.md](05_QA_E_CRITERIOS_DE_ACEITE.md). Estratégia de ingestão: [03_INGESTAO_E_DESEMPENHO.md](03_INGESTAO_E_DESEMPENHO.md).
