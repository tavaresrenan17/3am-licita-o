-- Migration: Tabela e RPCs para Alexandria (Acervo dedicado de licitacoes)
create table if not exists public.licitacoes_alexandria (
  licitacao_id uuid primary key
    references public.licitacoes (id) on delete cascade,
  adicionado_em timestamptz not null default now(),
  adicionado_por text default 'equipe',
  observacoes text default ''
);

create index if not exists licitacoes_alexandria_adicionado_idx
  on public.licitacoes_alexandria (adicionado_em desc);

alter table public.licitacoes_alexandria enable row level security;
revoke all on table public.licitacoes_alexandria from public, anon, authenticated;

create or replace function public.mover_para_alexandria(
  p_licitacao_ids uuid[]
) returns integer
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_inseridos integer := 0;
begin
  if p_licitacao_ids is null or array_length(p_licitacao_ids, 1) = 0 then
    return 0;
  end if;

  insert into public.licitacoes_alexandria (licitacao_id)
  select unnest(p_licitacao_ids)
  on conflict (licitacao_id) do nothing;

  get diagnostics v_inseridos = row_count;

  insert into public.licitacoes_historico (licitacao_id, origem, texto)
  select id, 'equipe', 'Movida para o acervo de Alexandria'
  from unnest(p_licitacao_ids) as id;

  return v_inseridos;
end;
$$;

create or replace function public.remover_de_alexandria(
  p_licitacao_ids uuid[]
) returns integer
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_removidos integer := 0;
begin
  if p_licitacao_ids is null or array_length(p_licitacao_ids, 1) = 0 then
    return 0;
  end if;

  delete from public.licitacoes_alexandria
   where licitacao_id = any(p_licitacao_ids);

  get diagnostics v_removidos = row_count;

  insert into public.licitacoes_historico (licitacao_id, origem, texto)
  select id, 'equipe', 'Removida de Alexandria (devolvida para Licitações Gerais)'
  from unnest(p_licitacao_ids) as id;

  return v_removidos;
end;
$$;

create or replace function public.listar_ids_alexandria()
returns table (licitacao_id uuid)
language sql
stable
security definer
set search_path = public, pg_catalog, pg_temp
as $$
  select licitacao_id from public.licitacoes_alexandria order by adicionado_em desc;
$$;
