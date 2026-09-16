# Supabase: persistência, filtros e atualização da interface

Data de verificação: 11/09/2026. Documento de integração para a LLM; não é uma migração executada. Os nomes locais abaixo são propostas e devem ser adaptados ao projeto. O contrato PNCP e a matriz de filtros dos demais documentos prevalecem sobre suposições de campos da fonte.

## 1. Decisão principal

Persistir primeiro os cabeçalhos de editais/contratações de cada página concluída. A tela consulta o catálogo salvo com filtros executados no Postgres. A coleta continua em tarefas duráveis, com prioridade para oportunidades em recebimento de propostas. Itens e documentos são enriquecidos quando necessários.

Uma alteração de filtro que continua dentro da cobertura coletada deve gerar uma nova consulta ao Supabase. Quando amplia período, modalidade, localidade ou outra dimensão além da cobertura existente, o planejador agenda somente os segmentos faltantes e devolve os resultados disponíveis com estado parcial explícito.

**Resultado vazio só significa ausência no universo solicitado quando a cobertura relevante terminou sem lacunas.** Diferenciar:

- `coletando`: páginas ou segmentos ainda pendentes;
- `parcial`: parte disponível, inclusive em caso de falha;
- `completo_no_escopo`: todos os segmentos previstos concluídos, para a versão e instante de observação registrados;
- `desatualizado`: cobertura completa anterior cuja política de atualização venceu.

Uma busca concluída no endpoint de propostas representa o conjunto observado nessa coleta. O estado no PNCP pode mudar logo depois. A aplicação deve mostrar quando consultou a fonte.

## 2. Estrutura lógica sugerida

| Tabela/conjunto | Identidade e finalidade |
|---|---|
| `pncp_contratacoes` | Uma linha canônica por `numero_controle_pncp`, com cabeçalhos e campos filtráveis tipados. Não duplicar o mesmo edital por busca ou usuário. |
| `pncp_itens` | Chave composta pela contratação e identificador/número de item conforme contrato validado. Busca detalhada e valores por item. |
| `pncp_payloads` em schema privado | JSON original, endpoint, versão de schema, hash, instante de coleta e referência ao registro. Retenção definida, sem enviar na listagem. |
| `pncp_enrichment_state` | Recurso, contratação, estado, versão do cabeçalho, páginas concluídas/esperadas, erro e instante da última conclusão. Ausência de item não significa item inexistente. |
| `ingestion_jobs` | Escopo normalizado, status, dono quando privado, progresso, cancelamento e erros. |
| `ingestion_segments` | Endpoint + filtros da fonte + janela + página/partição + geração da execução, tentativas e checkpoint. |
| `coverage_segments` | Escopo realmente percorrido, nível de detalhe, instante observado e validade. Não inferir cobertura a partir apenas das linhas salvas. |
| `ingestion_outbox` | Evento pequeno de progresso/invalidação, persistido junto ao commit dos dados. Consumidor publica após commit e admite repetição. |
| `saved_searches`, `favorites` | Dados privados vinculados ao usuário/organização, isolados por RLS. |

Campos locais úteis no cabeçalho, com mapeamento explícito para o JSON PNCP: CNPJ do órgão, ano e sequencial da compra, UF, código IBGE do município, código da unidade, modalidade, modo de disputa, situação, SRP, amparo legal, esfera/poder, objeto, valor estimado, publicação, abertura e encerramento de propostas, atualização declarada pela fonte e instante da última coleta.

Regras de modelagem:

1. CNPJ, código IBGE e outros identificadores são texto. Preservar zeros e CNPJ alfanumérico; não converter em número nem remover letras. Validar a representação oficial antes de normalizar.
2. Valores monetários e quantidades devem usar tipos decimais adequados ao contrato. Valor desconhecido ou sigiloso permanece `NULL` ou sinalizado; não substituir por zero.
3. `data_publicacao`, mapeada de `dataPublicacaoPncp`, usa `timestamptz`, preservando data e horário; abertura e encerramento de propostas também usam `timestamptz`. O adaptador deve identificar o fuso do contrato da fonte antes de converter textos sem offset e preservar a representação original. Não assumir UTC em texto sem offset. Reservar `date` aos campos que representam somente calendário, sem horário. Os limites de dias escolhidos pelo usuário usam `America/Sao_Paulo` e são convertidos para instantes UTC antes da consulta local.
4. Não armazenar `aberta=true` como verdade permanente: prazo e situação mudam. Preservar situação e prazos, guardar a observação no endpoint de propostas e reavaliar a regra de elegibilidade na consulta. A classificação local precisa documentar fuso, atualidade e diferença em relação ao conjunto publicado pelo PNCP.
5. Separar `source_updated_at` (versão temporal comparável, se houver), `fetched_at` (observação) e `stored_at` (persistência). Nenhum deles substitui os outros.
6. Distinguir campos ausentes em uma resposta parcial de campos explicitamente nulos. Um cabeçalho de listagem não deve apagar detalhes obtidos por outro recurso.

## 3. Escrita idempotente e progresso confiável

Upsert aceita lotes e chave de conflito; não retorna as linhas gravadas por padrão. Evitar adicionar `.select('*')` à escrita da ingestão. O upsert simples resolve duplicação, mas a política de versão precisa ser acrescentada pelo projeto. [Supabase upsert](https://supabase.com/docs/reference/javascript/upsert).

Fluxo recomendado por página/lote:

1. Validar envelope, tipos e chave; deduplicar identidades dentro do lote.
2. Calcular hash do conteúdo de negócio em representação estável, excluindo metadados locais como `fetched_at`.
3. Em uma transação, mesclar cabeçalhos, registrar o lote aplicado, avançar checkpoint/progresso e gravar evento na outbox.
4. Marcar a página concluída somente após o commit. Se qualquer registro falhar, não declarar página totalmente aplicada. Alternativamente, usar quarentena explícita e manter a cobertura parcial até resolver as rejeições.
5. Confirmar/arquivar a mensagem da fila depois do commit. Se o processo morrer antes da confirmação, a repetição encontra o lote já aplicado e não incrementa contadores outra vez.

Aplicar unicidade ao identificador de execução/lote e ao registro canônico. `ON CONFLICT DO UPDATE` permite atualização condicional e atômica; entradas duplicadas no mesmo comando podem gerar erro. [PostgreSQL INSERT](https://www.postgresql.org/docs/current/sql-insert.html).

Política contra resposta antiga sobrescrever nova:

- Versão da fonte mais recente: atualizar campos sob responsabilidade desse recurso.
- Versão anterior: manter a atual e registrar observação sem regressão.
- Mesma versão e mesmo hash: não regravar o conteúdo; reduzir trabalho de índices e eventos.
- Mesma versão e conteúdo divergente, ou versão ausente/não comparável: serializar reconciliação por identidade e fazer leitura canônica atual. Registrar conflito; não escolher o vencedor apenas pela ordem de chegada dos workers.

A regra deve ser atômica no banco ou protegida por mecanismo equivalente. Fazer `SELECT`, comparar no processo e depois `UPDATE` sem proteção tem condição de corrida. Se a nova versão tiver o mesmo conteúdo, ainda avançar os metadados necessários à comparação de versões.

Para o incremental, usar lotes pequenos e limitados por bytes, tempo de transação e memória. Para uma carga histórica muito grande, avaliar conexão PostgreSQL com `COPY` para staging e merge em lotes. Supabase documenta essa via e desencoraja importações massivas pela Data API. Não há tamanho universal ideal: medir e ajustar. [Importação de dados](https://supabase.com/docs/guides/database/import-data).

## 4. Filtrar todas as linhas salvas no servidor

Não buscar uma página no navegador e depois tratar seu filtro em memória como busca no catálogo inteiro. O banco deve aplicar predicados antes da paginação; o navegador recebe somente colunas de exibição e a página solicitada.

| Necessidade | Predicado/local apropriado |
|---|---|
| UF, município, modalidade, órgão, situação, SRP | Igualdade/`IN` em colunas tipadas. |
| Faixa de datas e valores | Comparações tipadas, com regra explícita para limites e `NULL`. |
| Palavras do objeto | FTS com configuração de idioma deliberada. |
| Trecho literal do objeto | `ILIKE` com índice trigram quando a carga justificar. |
| Código/categoria/descrição de item | `EXISTS` em itens enriquecidos; indicador de cobertura de itens obrigatório. |
| Vários critérios no mesmo item | Um único `EXISTS` contendo todos os critérios. Dois `EXISTS` independentes podem corresponder a itens diferentes e produzir falso positivo. |
| Preferências/favoritos do usuário | Relação privada protegida por RLS. |

FTS é busca lexical e pode aplicar redução de palavras e palavras ignoradas; não equivale a substring nem a pesquisa por sinônimos. `websearch_to_tsquery` permite uma sintaxe de entrada orientada ao usuário; parametrizar o texto. [Controles de FTS no PostgreSQL](https://www.postgresql.org/docs/current/textsearch-controls.html).

Referência SQL de FTS, a adaptar depois do mapeamento dos campos:

```sql
alter table public.pncp_contratacoes
  add column objeto_fts tsvector
  generated always as (
    to_tsvector('portuguese'::regconfig, coalesce(objeto, ''))
  ) stored;

create index pncp_contratacoes_objeto_fts_idx
  on public.pncp_contratacoes using gin (objeto_fts);

-- $1 é parâmetro de texto, jamais SQL concatenado.
select numero_controle_pncp, objeto
from public.pncp_contratacoes
where objeto_fts @@ websearch_to_tsquery('portuguese'::regconfig, $1)
order by numero_controle_pncp
limit 51;
```

Coluna gerada e GIN são uma estrutura documentada pelo Supabase. Testar termos de compras reais, siglas, acentos e flexões antes de fixar a configuração. [Full Text Search](https://supabase.com/docs/guides/database/full-text-search).

Para substring, ativar `pg_trgm` no schema permitido no projeto e indexar `objeto` com `gin_trgm_ops` devidamente qualificado. Um `ILIKE '%termo%'` pode usar esse índice; entradas sem trigramas úteis podem varrer o índice inteiro. Definir comportamento para termos muito curtos e escapar `%`/`_` se a opção da interface promete trecho literal. [PostgreSQL pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html).

## 5. Índices e paginação

Criar índices a partir de consultas frequentes medidas. Exemplos candidatos para buscas por UF/modalidade e órgão, seguidas de publicação:

```sql
create index pncp_contratacoes_uf_modalidade_publicacao_idx
  on public.pncp_contratacoes
  (uf, modalidade_id, data_publicacao desc, numero_controle_pncp desc);

create index pncp_contratacoes_orgao_publicacao_idx
  on public.pncp_contratacoes
  (cnpj_orgao, data_publicacao desc, numero_controle_pncp desc);
```

Para oportunidades abertas ordenadas pelo encerramento mais próximo, avaliar também o seguinte candidato, caso UF e modalidade façam parte das consultas frequentes:

```sql
create index pncp_contratacoes_uf_modalidade_encerramento_idx
  on public.pncp_contratacoes
  (uf, modalidade_id, data_encerramento_proposta, numero_controle_pncp);
```

Esse índice não torna UF nem modalidade filtros obrigatórios. Consultas nacionais ou sem modalidade podem precisar de outro índice, escolhido por medição. Comparar o encerramento a um instante parametrizado na consulta. Não criar índice parcial com `WHERE data_encerramento_proposta > now()`: o instante muda, e funções usadas em definições de índice devem ser imutáveis. A elegibilidade também depende da situação e da atualidade da coleta, conforme o contrato do projeto. [PostgreSQL CREATE INDEX](https://www.postgresql.org/docs/current/sql-createindex.html).

Não criar um índice para cada combinação de filtros: todos oneram escrita, disco e manutenção. Os exemplos por UF/modalidade não atendem automaticamente uma busca nacional sem essas restrições. Inspecionar planos com volume e distribuição representativos; o otimizador pode corretamente preferir uma varredura em tabelas pequenas ou filtros pouco seletivos. [Índices Supabase](https://supabase.com/docs/guides/database/postgres/indexes).

Para primeira página, usar limite pequeno, por exemplo 50 registros, e buscar 51 para sinalizar continuidade. Na página seguinte, preferir cursor com ordenação total. Exemplo limitado a uma faixa de publicação, em que datas nulas naturalmente não atendem ao filtro:

```sql
select numero_controle_pncp, objeto, uf, modalidade_id,
       data_publicacao, valor_total_estimado
from public.pncp_contratacoes
where uf = $1
  and modalidade_id = $2
  and data_publicacao >= $3::timestamptz
  and data_publicacao < $4::timestamptz
  and (data_publicacao, numero_controle_pncp)
      < ($5::timestamptz, $6::text)
order by data_publicacao desc, numero_controle_pncp desc
limit 51;
```

Na primeira página, omitir o predicado do cursor. Esse exemplo usa fim exclusivo na consulta **local**; isso não altera a semântica de datas exigida pelo PNCP. Se a interface recebe data final inclusiva, obter a meia-noite do dia seguinte com operações de calendário em `America/Sao_Paulo`; converter tanto o início quanto o fim para UTC antes de vincular `$3` e `$4`. Por exemplo, o dia 11/09/2026 em Brasília corresponde ao intervalo local `[2026-09-11T03:00:00Z, 2026-09-12T03:00:00Z)`. Não somar 24 horas cegamente para datas históricas sujeitas a mudança de offset.

O cursor `$5` preserva o instante completo e sua precisão. Exemplo: publicações às 09:00 e às 09:30 de 11/09/2026, no horário de Brasília, são armazenadas como `2026-09-11T12:00:00Z` e `2026-09-11T12:30:00Z`. Em ordem decrescente, a das 09:30 vem primeiro; o cursor deve guardar `12:30:00Z` e a identidade dessa linha. Reduzi-lo a `2026-09-11` eliminaria o horário e poderia pular registros do mesmo dia. `timestamptz` mantém o instante; o offset original, se necessário à auditoria, fica no payload preservado. [Tipos de data/hora PostgreSQL](https://www.postgresql.org/docs/current/datatype-datetime.html).

Para consultas sem faixa de publicação, definir também paginação de registros com data nula, sem descartá-los silenciosamente. Se a ordenação escolhida for por encerramento, usar o respectivo instante e a identidade no cursor, com os mesmos cuidados de precisão e nulos.

O cursor deve carregar valores da última linha exibida, hash dos filtros e ordenação. Invalidá-lo ao mudar filtros. Não montar SQL ou uma expressão `.or()` diretamente com texto livre do usuário; preferir RPC com parâmetros tipados quando a combinação ficar complexa.

`range(0,49)` retorna até 50 linhas: os extremos são inclusivos e começam em zero. É aceitável para navegação curta com ordenação explícita; offsets profundos têm custo porque linhas descartadas ainda são computadas. [Supabase range](https://supabase.com/docs/reference/javascript/using-modifiers-range), [PostgreSQL LIMIT/OFFSET](https://www.postgresql.org/docs/current/queries-limit.html).

A Data API tem limite padrão documentado de 1.000 linhas por resposta, configurável. Confirmar o valor real no projeto e manter o limite da aplicação abaixo dele. Não considerar resposta truncada como a tabela completa nem aumentar o limite para carregar tudo. [Referência da Data API](https://supabase.com/docs/reference/python/select).

Paginação por cursor melhora navegação; não cria snapshot entre requisições. Se linhas forem alteradas, a ordenação pode mudar. Para uma exportação reproduzível, criar job que materialize o conjunto/versionamento no servidor ou execute leitura consistente apropriada. Não manter uma transação aberta durante a navegação do usuário. Evitar contagem exata a cada tecla; calcular quando necessária e identificar contagens parciais/estimadas como tais.

## 6. Realtime como aviso de progresso e atualização

Supabase recomenda Broadcast para escala e segurança. Postgres Changes verifica acesso por evento e assinante e mantém processamento em uma thread; um grande importador com muitos assinantes precisa de benchmark específico. [Assinar mudanças](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes), [Escala de Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes#scaling-postgres-changes).

Padrão proposto:

1. Persistir um evento na outbox quando houver progresso de lote/segmento.
2. Consumidor reúne eventos próximos e envia mensagem pequena em canal privado autorizado, como `job:<id>` ou tópico de catálogo ao qual o usuário tenha acesso.
3. Mensagem contém `job_id`, `event_id`, `revision`, estado e indicação de que existem dados novos. Não envia JSON bruto, todas as linhas nem filtros privados a canais compartilhados.
4. Cliente invalida a consulta afetada e refaz a página no servidor com os filtros atuais. Agrupar avisos próximos evita uma consulta por linha inserida.
5. Na abertura/reconexão, ler estado atual do job e refazer consulta. Não depender de ter recebido cada evento para preservar a completude.

`realtime.send()` permite payload de domínio; canais privados requerem autorização própria. A RLS do catálogo não deve ser presumida como autorização automática dos tópicos. [Broadcast](https://supabase.com/docs/guides/realtime/broadcast).

Tratar eventos duplicados e fora de ordem com identificador/revisão do job. Ao fechar a corrida entre assinatura e consulta inicial, assinar, consultar o estado e repetir se um aviso mais recente chegar durante a leitura. Se um edital deixar de corresponder ao filtro, a nova consulta o remove da página. Não confiar em ouvir apenas eventos de linhas que já correspondem ao filtro.

A frequência inicial de agrupamento, por exemplo uma atualização por segundo por job, é parâmetro do projeto, não limite ou garantia do Supabase. Monitorar mensagens por segundo, conexões, atraso e desconexões conforme o plano contratado. [Limites Realtime](https://supabase.com/docs/guides/realtime/limits).

## 7. Worker durável e segurança

Supabase Queues é uma opção de fila persistida no Postgres. A entrega única documentada vale dentro da janela de visibilidade; falhas e expiração podem exigir nova entrega. Portanto, a regra de negócio permanece idempotente. Ajustar janela/lease ao pior tempo esperado de lote, renovar quando suportado, limitar tentativas e separar falhas definitivas para análise. [Supabase Queues](https://supabase.com/docs/guides/queues).

Um worker de longa duração em serviço apropriado simplifica a coleta. Edge Functions também podem processar tarefas curtas da fila, desde que cada execução termine com folga e salve progresso. Os limites hospedados consultados são: memória 256 MB, CPU de 2 s por requisição, duração de worker de 150 s no Free ou 400 s nos planos pagos e idle timeout de requisição de 150 s. Revalidar ao implementar; não colocar toda uma varredura nacional em uma única invocação. [Limites Edge Functions](https://supabase.com/docs/guides/functions/limits).

Usar cliente administrativo exclusivo no servidor, sem compartilhar sessão do usuário. Secret key pode operar como `service_role` e ignorar RLS; jamais enviá-la ao navegador. O cliente público usa chave publicável e autenticação/políticas compatíveis com o produto. [RLS e bypass](https://supabase.com/docs/guides/database/postgres/row-level-security#bypassing-row-level-security), [API keys](https://supabase.com/docs/guides/getting-started/api-keys).

Habilitar RLS nas tabelas expostas e criar políticas explícitas de leitura. Escrita de PNCP deve ficar restrita ao processo autorizado. Schemas de raw payloads, checkpoints e fila devem permanecer fora da API pública quando não necessários. Jobs, buscas salvas e favoritos devem validar proprietário/organização. RPC de busca deve usar `SECURITY INVOKER` por padrão, parâmetros tipados e limite máximo; uma RPC administrativa requer privilégios de execução restritos e revisão de acesso.

## 8. Critérios de aceite para a LLM

- Reprocessar a mesma página não duplica registros, contagem nem progresso.
- Resposta antiga concluída depois da nova não regride o cabeçalho.
- Falha antes do commit não avança checkpoint; falha após commit e antes de confirmar a fila admite repetição segura.
- Um filtro encontra linhas fora da primeira página salva e funciona com mais de 1.000 registros.
- Paginação mantém horário, precisão e desempate por identidade; duas publicações no mesmo dia com horários distintos não são puladas. Mudanças de filtro reiniciam cursor.
- Termos FTS, substring, filtros nulos e critérios simultâneos de item têm semânticas testadas separadamente.
- Falta de enriquecimento não é apresentada como ausência de correspondência confirmada.
- O navegador vê a primeira página persistida antes do fim da coleta, e o estado parcial permanece visível.
- Queda/reconexão de Realtime recupera o estado consultando o banco.
- Outro usuário não consegue ler jobs privados, favoritos ou tópicos sem autorização.
- Medir separadamente latência da fonte, espera na fila, transformação, gravação, primeira página, consulta filtrada e aviso ao cliente. Definir metas somente após medir no projeto real.

Nada neste documento foi aplicado ao banco do usuário. SQL é referência de desenho e precisa passar por adaptação de schema, revisão de acesso e testes antes de executar.
