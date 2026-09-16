-- Velocidade da consulta local, para o catálogo crescer sem a tela desacelerar.
--
-- A arquitetura é: o PNCP enche o catálogo de madrugada, e durante o dia a tela
-- só lê o banco. Então o tempo que a equipe sente é tempo de índice — nenhuma
-- otimização na coleta melhora a busca, e nenhum índice acelera a coleta.
--
-- O problema que estes índices resolvem, do arquivo 04 §5:
--
--   A busca por texto é `objeto_fts @@ ... OR objeto ilike ... OR orgao ilike ...`.
--   `ILIKE '%termo%'` não é indexável sem trigrama, e num OR o Postgres só usa
--   índice se TODOS os ramos forem indexáveis. Ou seja: hoje o índice de texto
--   completo não é usado quando há termo de busca — a consulta varre a tabela
--   inteira. Com 923 linhas isso custa ~135 ms e ninguém nota; com o catálogo
--   nacional que se pretende manter, passa a doer.
--
-- Observação honesta: este projeto não expõe EXPLAIN pela API, então o plano não
-- foi medido aqui. A escolha vem do comportamento documentado do planejador e da
-- recomendação do arquivo 04. Com a tabela pequena o Postgres vai continuar
-- preferindo varredura — e está certo em fazê-lo; o ganho aparece com volume.

-- Trigramas ficam no schema `extensions`, convenção do Supabase para não poluir
-- o `public` que a API expõe.
create extension if not exists pg_trgm with schema extensions;

-- Classe de operador qualificada: `extensions` nem sempre está no search_path de
-- quem cria o índice, e sem a qualificação o CREATE INDEX falha.
create index if not exists licitacoes_objeto_trgm_idx
  on public.licitacoes using gin (objeto extensions.gin_trgm_ops);

create index if not exists licitacoes_orgao_trgm_idx
  on public.licitacoes using gin (orgao extensions.gin_trgm_ops);

-- "Novas do dia" no painel e o filtro `criadas_de` ordenam por entrada no nosso
-- catálogo, não por publicação no PNCP.
create index if not exists licitacoes_created_at_idx
  on public.licitacoes (created_at desc);

-- "Recomendadas" filtra por score e a tela ordena por ele.
create index if not exists licitacoes_score_idx
  on public.licitacoes (score_aderencia desc);

-- Órgão é filtro de igualdade vindo do seletor da tela; o índice trigrama acima
-- serve ao ILIKE, não à igualdade.
create index if not exists licitacoes_orgao_idx
  on public.licitacoes (orgao);

-- Deliberadamente NÃO indexados: `categoria` e `status_interno` têm pouquíssimos
-- valores distintos, e `municipio` só é filtrado junto de UF, que já entra no
-- índice composto. O arquivo 04 §5 avisa: índice para cada combinação onera
-- escrita e manutenção, e a coleta escreve muito.

-- Estatísticas atualizadas, para o planejador enxergar os índices novos.
analyze public.licitacoes;
