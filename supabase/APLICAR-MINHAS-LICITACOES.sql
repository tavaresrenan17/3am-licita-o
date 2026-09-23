-- ==============================================================================
-- MINHAS LICITAÇÕES
-- Licitações separadas pela equipe para análise cautelosa e aprofundada.
-- Enquanto estão aqui, somem da listagem geral de Licitações; podem ser
-- devolvidas a qualquer momento.
--
-- Substitui a migração 20260922120000, que nunca chegou ao banco: até esta
-- data a tela funcionava só pela reserva que lê o histórico de eventos. Por
-- isso a tabela nasce preenchida a partir desse histórico, e os textos antigos
-- do histórico são reescritos com o nome novo.
-- ==============================================================================

create table if not exists public.minhas_licitacoes (
  licitacao_id uuid primary key
    references public.licitacoes (id) on delete cascade,
  adicionado_em timestamptz not null default now(),
  adicionado_por text default 'equipe',
  observacoes text default ''
);

create index if not exists minhas_licitacoes_adicionado_idx
  on public.minhas_licitacoes (adicionado_em desc);

alter table public.minhas_licitacoes enable row level security;
revoke all on table public.minhas_licitacoes from public, anon, authenticated;

-- Mover licitações em lote para Minhas Licitações
create or replace function public.mover_para_minhas_licitacoes(
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

  insert into public.minhas_licitacoes (licitacao_id)
  select unnest(p_licitacao_ids)
  on conflict (licitacao_id) do nothing;

  get diagnostics v_inseridos = row_count;

  -- Auditoria
  insert into public.licitacoes_historico (licitacao_id, origem, texto)
  select id, 'equipe', 'Movida para Minhas Licitações'
  from unnest(p_licitacao_ids) as id;

  return v_inseridos;
end;
$$;

-- Remover licitações de Minhas Licitações (devolvendo-as para as Licitações Gerais)
create or replace function public.remover_de_minhas_licitacoes(
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

  delete from public.minhas_licitacoes
   where licitacao_id = any(p_licitacao_ids);

  get diagnostics v_removidos = row_count;

  -- Auditoria
  insert into public.licitacoes_historico (licitacao_id, origem, texto)
  select id, 'equipe', 'Removida de Minhas Licitações (devolvida para Licitações Gerais)'
  from unnest(p_licitacao_ids) as id;

  return v_removidos;
end;
$$;

-- Listar todos os IDs que estão atualmente em Minhas Licitações
create or replace function public.listar_ids_minhas_licitacoes()
returns table (licitacao_id uuid)
language sql
stable
security definer
set search_path = public, pg_catalog, pg_temp
as $$
  select licitacao_id from public.minhas_licitacoes order by adicionado_em desc;
$$;

revoke all on function public.mover_para_minhas_licitacoes(uuid[]) from public, anon, authenticated;
revoke all on function public.remover_de_minhas_licitacoes(uuid[]) from public, anon, authenticated;
revoke all on function public.listar_ids_minhas_licitacoes() from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- Dados: o nome antigo só aparece daqui para baixo, porque é o texto que já
-- está gravado no histórico e precisa ser encontrado para ser reescrito.
-- ------------------------------------------------------------------------------

-- 1. Quem estava na lista pela reserva do histórico: vale o último evento de
--    cada licitação (movida ou removida).
insert into public.minhas_licitacoes (licitacao_id, adicionado_em)
select ultimo.licitacao_id, ultimo.em
  from (
    select distinct on (h.licitacao_id) h.licitacao_id, h.em, h.texto
      from public.licitacoes_historico h
     where h.texto in ('Movida para o acervo de Alexandria',
                       'Removida de Alexandria (devolvida para Licitações Gerais)')
     order by h.licitacao_id, h.em desc
  ) ultimo
 where ultimo.texto = 'Movida para o acervo de Alexandria'
on conflict (licitacao_id) do nothing;

-- 2. Textos do histórico com o nome novo.
update public.licitacoes_historico
   set texto = 'Movida para Minhas Licitações'
 where texto = 'Movida para o acervo de Alexandria';

update public.licitacoes_historico
   set texto = 'Removida de Minhas Licitações (devolvida para Licitações Gerais)'
 where texto = 'Removida de Alexandria (devolvida para Licitações Gerais)';

update public.licitacoes_historico
   set texto = replace(texto, 'Status alterado em Alexandria para', 'Status alterado em Minhas Licitações para')
 where texto like 'Status alterado em Alexandria para %';

notify pgrst, 'reload schema';
