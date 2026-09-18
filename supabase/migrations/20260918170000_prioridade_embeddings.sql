-- Prioridade da fila de embeddings e trava contra concorrência.
--
-- Medido em 18/09/2026, e é o motivo desta migração existir:
--
--   baixar um documento     ~1,1 s   (6-10 min para os 1.425, sem nenhuma falha)
--   extrair o texto         ~0,95 s  (~23 min para todos)
--   vetorizar um edital     ~45 s    (18,2 chunks em média, ~25.900 no total)
--
-- Ou seja: baixar e extrair são baratos e não precisam de política de seleção
-- nenhuma. O custo inteiro está em vetorizar. Por isso a prioridade vive aqui,
-- na fila de embeddings, e não na fila de arquivos.
--
-- E o achado que manda nesta migração: o Ollama é UMA PISTA SÓ. Ele não
-- paraleliza, enfileira. Com a carga de licitações rodando, uma chamada que
-- leva 123 ms ocioso passou a levar de 817 ms a 8.765 ms. Dois jobs de
-- embedding ao mesmo tempo não dividem o trabalho: multiplicam o tempo dos
-- dois. Daí a trava.

-- ------------------------------------------------------------- sinal de acesso

alter table public.licitacoes
  add column if not exists acessada_em timestamptz;

comment on column public.licitacoes.acessada_em is
  'Última vez que alguém abriu esta licitação na tela. Serve de prioridade para a fila de embeddings: o que a equipe está olhando é vetorizado antes do resto.';

create index if not exists licitacoes_acessada_em_idx
  on public.licitacoes (acessada_em desc nulls last)
  where acessada_em is not null;

create or replace function public.marcar_licitacao_acessada(p_licitacao_id uuid)
returns void
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  update public.licitacoes
     set acessada_em = now()
   where id = p_licitacao_id;
$$;

-- ---------------------------------------------------------------------- trava

-- Lease com dono e validade, e não `pg_advisory_lock`: o PostgREST trabalha
-- sobre um pool de conexões, então um lock de sessão ficaria preso numa conexão
-- reciclada. Uma linha com prazo é recuperável sozinha se o processo morrer.
create table if not exists public.embedding_lease (
  id integer primary key default 1 check (id = 1),
  dono text,
  expira_em timestamptz
);

insert into public.embedding_lease (id) values (1) on conflict (id) do nothing;

alter table public.embedding_lease enable row level security;

comment on table public.embedding_lease is
  'Garante um único job de embedding por vez. O Ollama nao paraleliza: dois jobs simultaneos degradam os dois (medido: 123 ms vira 817-8765 ms).';

create or replace function public.adquirir_lease_embedding(
  p_dono text,
  p_duracao interval default '5 minutes'
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  -- `row_count` é INTEIRO. Declarar isto como boolean faz o PL/pgSQL aceitar a
  -- atribuição por conversão de I/O e depois explodir em `boolean > integer`,
  -- que não existe — e só na PRIMEIRA CHAMADA, porque o corpo só é analisado
  -- então. A migração diria "Success" e a fila ficaria travada.
  v_linhas integer;
begin
  -- Renova se já for meu, toma se estiver vago ou vencido, recusa caso contrário.
  -- `expira_em is null` precisa ser explícito: um UPDATE manual de emergência
  -- que deixe `dono` preenchido e `expira_em` nulo faria a cláusula inteira
  -- virar NULL, e o lease travaria para sempre — justo a recuperação por prazo
  -- que é a razão deste desenho existir.
  update public.embedding_lease
     set dono = p_dono, expira_em = now() + p_duracao
   where id = 1
     and (dono is null or dono = p_dono or expira_em is null or expira_em < now());

  get diagnostics v_linhas = row_count;
  return v_linhas > 0;
end;
$$;

create or replace function public.liberar_lease_embedding(p_dono text)
returns void
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  update public.embedding_lease
     set dono = null, expira_em = null
   where id = 1 and dono = p_dono;
$$;

-- --------------------------------------------------------- fila por prioridade

-- Ordem de prioridade, igual nas duas filas:
--   0. a equipe marcou interesse (interessante / em_analise / prioridade)
--   1. elegível: proposta aberta e score acima do mínimo recomendado
--   2. alguém abriu na tela recentemente
--   3. o resto, em fundo contínuo
create or replace function public.prioridade_embedding(l public.licitacoes, p_score_minimo integer)
returns integer
language sql
stable
as $$
  select case
    when l.prioridade or l.status_interno in ('interessante', 'em_analise') then 0
    when public.licitacao_aberta(l.situacao_compra_id, l.data_abertura_proposta,
                                 l.data_encerramento_proposta, now())
         and l.score_aderencia >= p_score_minimo then 1
    when l.acessada_em is not null then 2
    else 3
  end;
$$;

create or replace function public.reservar_licitacoes_para_embedding(
  p_limite integer default 50,
  p_modelo text default 'bge-m3',
  p_score_minimo integer default 60
) returns table (licitacao_id uuid, texto text, origem_hash text)
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select l.id,
         public.texto_licitacao_para_embedding(l.*),
         md5(public.texto_licitacao_para_embedding(l.*))
    from public.licitacoes l
    left join public.licitacoes_embedding e on e.licitacao_id = l.id
   where length(public.texto_licitacao_para_embedding(l.*)) > 0
     and (
           e.licitacao_id is null
        or e.origem_hash is distinct from md5(public.texto_licitacao_para_embedding(l.*))
        or e.modelo is distinct from p_modelo
     )
   order by public.prioridade_embedding(l.*, p_score_minimo),
            l.acessada_em desc nulls last,
            l.data_encerramento_proposta asc nulls last,
            l.id
   limit greatest(p_limite, 0);
$$;

create or replace function public.reservar_documentos_para_embedding(
  p_limite integer default 10,
  p_modelo text default 'bge-m3',
  p_score_minimo integer default 60
) returns table (documento_id uuid, licitacao_id uuid, texto text, origem_hash text)
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  -- A ordenação por função de prioridade impede o index scan ordenado que o
  -- `documentos_arquivo_fila_idx` dava antes, então o planner varre e ordena.
  -- Escolher só os ids primeiro mantém o `texto` do edital FORA do sort: sem
  -- isso, cada chamada detoasta o texto completo de todos os documentos
  -- extraídos só para descartar quase todos no LIMIT.
  with candidatos as (
    select a.documento_id, a.licitacao_id
      from public.documentos_arquivo a
      join public.licitacoes l on l.id = a.licitacao_id
     where a.estado = 'extraido'
       and a.texto is not null
       and not exists (
             select 1 from public.documento_chunks c
              where c.documento_id = a.documento_id
                and c.origem_hash = md5(a.texto)
                and c.modelo = p_modelo
       )
     order by public.prioridade_embedding(l.*, p_score_minimo),
              l.acessada_em desc nulls last,
              a.atualizado_em asc
     limit greatest(p_limite, 0)
  )
  select c.documento_id, c.licitacao_id, a.texto, md5(a.texto)
    from candidatos c
    join public.documentos_arquivo a on a.documento_id = c.documento_id;
$$;

revoke all on function public.marcar_licitacao_acessada(uuid) from public, anon, authenticated;
revoke all on function public.adquirir_lease_embedding(text, interval) from public, anon, authenticated;
revoke all on function public.liberar_lease_embedding(text) from public, anon, authenticated;
revoke all on function public.prioridade_embedding(public.licitacoes, integer) from public, anon, authenticated;
revoke all on function public.reservar_licitacoes_para_embedding(integer, text, integer) from public, anon, authenticated;
revoke all on function public.reservar_documentos_para_embedding(integer, text, integer) from public, anon, authenticated;

-- As assinaturas antigas (sem p_score_minimo) ficariam órfãs no schema cache do
-- PostgREST e poderiam ser chamadas por engano. Removê-las é parte da migração.
drop function if exists public.reservar_licitacoes_para_embedding(integer, text);
drop function if exists public.reservar_documentos_para_embedding(integer, text);
