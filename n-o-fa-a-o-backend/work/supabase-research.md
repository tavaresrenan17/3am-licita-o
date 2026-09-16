# Pesquisa oficial Supabase/PostgreSQL — 2026-09-11

Escopo: ingestão de cabeçalhos PNCP, filtros no banco e atualização da interface. Não houve acesso a um projeto Supabase nem benchmark. Nenhum AGENTS.md foi encontrado no diretório ou ancestrais examinados até Documents.

## Fatos confirmados

- Supabase aceita upsert de objetos ou arrays; `onConflict` escolhe a identidade e a resposta não retorna linhas por padrão. [Upsert](https://supabase.com/docs/reference/javascript/upsert).
- PostgreSQL fornece decisão atômica em `ON CONFLICT DO UPDATE` e permite condição `WHERE`; não se pode afetar a mesma linha duas vezes no mesmo comando. Deduplicar entradas do lote. [INSERT](https://www.postgresql.org/docs/current/sql-insert.html).
- A documentação da Data API informa máximo padrão de 1.000 linhas, configurável no projeto. Confirmar o valor efetivo; não é limite total da tabela. [Referência Python atual](https://supabase.com/docs/reference/python/select). A página JS atual consultada não repetiu essa nota; não usar referência JS v1 para implementar.
- `range(from,to)` usa posições iniciadas em zero e inclui ambos os extremos. Precisa de ordenação previsível. [Range JS atual](https://supabase.com/docs/reference/javascript/using-modifiers-range).
- `OFFSET` grande ainda calcula as linhas descartadas. [PostgreSQL LIMIT/OFFSET](https://www.postgresql.org/docs/current/queries-limit.html).
- Supabase recomenda Broadcast para escala e segurança. Postgres Changes autoriza eventos por assinante e processa alterações em uma thread para manter ordem. [Assinatura](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes), [escala](https://supabase.com/docs/guides/realtime/postgres-changes#scaling-postgres-changes).
- `realtime.send()` permite payload de domínio, e Broadcast privado requer autorização. [Broadcast](https://supabase.com/docs/guides/realtime/broadcast).
- Queues persiste mensagens em Postgres; a entrega exatamente uma vez anunciada se limita à janela de visibilidade. Não deduzir efeito de negócio exatamente uma vez através de falhas. [Queues](https://supabase.com/docs/guides/queues).
- Edge Functions hospedadas: memória 256 MB, CPU 2 segundos por requisição; worker 150 s Free/400 s planos pagos e idle timeout 150 s. [Limites](https://supabase.com/docs/guides/functions/limits).
- Secret keys usam `service_role` e podem ignorar RLS; nunca cliente/navegador. Token de usuário anexado muda contexto para políticas desse usuário. [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security#bypassing-row-level-security), [chaves](https://supabase.com/docs/guides/getting-started/api-keys).
- FTS admite `tsvector` gerado e GIN. [FTS Supabase](https://supabase.com/docs/guides/database/full-text-search). `pg_trgm` admite índices para ILIKE e similaridade; padrão sem trigramas pode degenerar em varredura completa do índice. [pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html).
- Supabase documenta COPY para grandes importações e recomenda evitar importações massivas pela API. [Importação](https://supabase.com/docs/guides/database/import-data).

## Recomendações de engenharia, não garantias do fornecedor

Materializar catálogo compartilhado; separar payload original privado e dados privados do usuário. Gravar lotes limitados e realizar merge, progresso/checkpoint e outbox na mesma transação. Usar conexão Postgres/COPY para staging quando benchmark justificar. Proteger contra atualização regressiva por respostas concorrentes. Filtrar no servidor com paginação por cursor e ordem total; não baixar mil linhas e chamá-las de base completa. Comunicar invalidação e progresso por lote; cliente refaz consulta com filtros. Medir latência por fase e calibrar lote/concorrência, sem afirmar tempo de coleta nacional.

Arquivo de integração preparado: `outputs/04_SUPABASE_E_CONSULTAS.md`.
