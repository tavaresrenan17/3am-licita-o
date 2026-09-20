-- Cache e coordenação da análise semântica por licitação.
-- O navegador não recebe acesso: a tabela tem RLS sem policy e todas as RPCs
-- pertencem exclusivamente ao service_role.

create table if not exists public.licitacoes_analises (
  licitacao_id uuid primary key
    references public.licitacoes (id) on delete cascade,
  estado text not null
    check (estado in ('processando', 'pronta', 'erro')),
  resultado jsonb,
  fontes jsonb not null default '[]'::jsonb,
  cobertura jsonb not null default '{}'::jsonb,
  fingerprint text,
  modelo text,
  prompt_versao text not null,
  algoritmo_versao text not null,
  lease_id uuid,
  lease_expira_em timestamptz,
  erro text,
  gerado_em timestamptz,
  atualizado_em timestamptz not null default now()
);

create index if not exists licitacoes_analises_estado_idx
  on public.licitacoes_analises (estado, atualizado_em desc);
create index if not exists documento_chunks_licitacao_modelo_idx
  on public.documento_chunks (licitacao_id, modelo);

alter table public.licitacoes_analises enable row level security;

revoke all on table public.licitacoes_analises from public, anon, authenticated;

-- A CTE materializada reduz primeiro por licitação, documento ativo e
-- modelo. Só depois o operador vetorial calcula e ordena a distância.
create or replace function public.buscar_chunks_analise(
  p_licitacao_id uuid,
  p_embedding text,
  p_modelo text,
  p_limite integer default 12
) returns table (
  chunk_id uuid,
  licitacao_id uuid,
  documento_id uuid,
  nome text,
  tipo text,
  ordem integer,
  trecho text,
  distancia double precision
)
language plpgsql
stable
security definer
set search_path = pg_catalog, extensions, pg_temp
as $$
declare
  v_vetor extensions.halfvec(1024);
begin
  v_vetor := p_embedding::extensions.halfvec(1024);

  return query
  with candidatos as materialized (
    select c.id,
           c.licitacao_id,
           c.documento_id,
           d.nome,
           d.tipo_documento,
           c.ordem,
           c.texto,
           c.embedding
      from public.documento_chunks c
      join public.documentos_licitacao d on d.id = c.documento_id
     where c.licitacao_id = p_licitacao_id
       and d.licitacao_id = p_licitacao_id
       and d.ativo
       and c.modelo = p_modelo
  )
  select c.id,
         c.licitacao_id,
         c.documento_id,
         c.nome,
         c.tipo_documento,
         c.ordem,
         c.texto,
         (c.embedding <=> v_vetor)::double precision
    from candidatos c
   order by c.embedding <=> v_vetor, c.id
   limit greatest(coalesce(p_limite, 0), 0);
end;
$$;

-- Single-flight por licitação. O advisory lock serializa inclusive a
-- primeira criação da linha; um force nunca rouba um lease ainda válido.
create or replace function public.adquirir_lease_analise(
  p_licitacao_id uuid,
  p_fingerprint text,
  p_forcar boolean,
  p_prompt_versao text,
  p_algoritmo_versao text,
  p_lease_id uuid,
  p_duracao interval default '5 minutes'
) returns table (adquirido boolean, linha jsonb)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_atual public.licitacoes_analises;
  v_duracao interval;
begin
  if p_lease_id is null then
    raise exception 'lease_id obrigatorio';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_licitacao_id::text, 0));
  v_duracao := least(
    greatest(coalesce(p_duracao, '5 minutes'::interval), '1 minute'::interval),
    '15 minutes'::interval
  );

  select * into v_atual
    from public.licitacoes_analises
   where licitacao_id = p_licitacao_id
   for update;

  -- Replay do mesmo pedido: confirma ownership sem reiniciar nem prolongar.
  if found and v_atual.lease_id = p_lease_id then
    return query select v_atual.estado = 'processando', to_jsonb(v_atual);
    return;
  end if;

  if found
     and v_atual.estado = 'processando'
     and v_atual.lease_expira_em > now() then
    return query select false, to_jsonb(v_atual);
    return;
  end if;

  if found
     and not coalesce(p_forcar, false)
     and v_atual.estado = 'pronta'
     and v_atual.fingerprint = p_fingerprint then
    return query select false, to_jsonb(v_atual);
    return;
  end if;

  insert into public.licitacoes_analises as a (
    licitacao_id, estado, resultado, fontes, cobertura, fingerprint,
    modelo, prompt_versao, algoritmo_versao, lease_id, lease_expira_em,
    erro, atualizado_em
  ) values (
    p_licitacao_id, 'processando', null, '[]'::jsonb, '{}'::jsonb,
    p_fingerprint, null, p_prompt_versao, p_algoritmo_versao,
    p_lease_id, now() + v_duracao, null, now()
  )
  on conflict (licitacao_id) do update
    set estado = 'processando',
        fingerprint = excluded.fingerprint,
        prompt_versao = excluded.prompt_versao,
        algoritmo_versao = excluded.algoritmo_versao,
        lease_id = excluded.lease_id,
        lease_expira_em = excluded.lease_expira_em,
        erro = null,
        atualizado_em = now()
  returning * into v_atual;

  return query select true, to_jsonb(v_atual);
end;
$$;

-- Heartbeat: pode recuperar um worker lento depois do vencimento, desde que
-- nenhum novo token tenha assumido a linha.
create or replace function public.renovar_lease_analise(
  p_licitacao_id uuid,
  p_lease_id uuid,
  p_duracao interval default '5 minutes'
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_duracao interval;
begin
  v_duracao := least(
    greatest(coalesce(p_duracao, '5 minutes'::interval), '1 minute'::interval),
    '15 minutes'::interval
  );

  update public.licitacoes_analises
     set lease_expira_em = now() + v_duracao,
         atualizado_em = now()
   where licitacao_id = p_licitacao_id
     and estado = 'processando'
     and lease_id = p_lease_id;

  return found;
end;
$$;

create or replace function public.concluir_analise_licitacao(
  p_licitacao_id uuid,
  p_lease_id uuid,
  p_resultado jsonb,
  p_fontes jsonb,
  p_cobertura jsonb,
  p_modelo text
) returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_atual public.licitacoes_analises;
begin
  update public.licitacoes_analises
     set estado = 'pronta',
         resultado = p_resultado,
         fontes = coalesce(p_fontes, '[]'::jsonb),
         cobertura = coalesce(p_cobertura, '{}'::jsonb),
         modelo = p_modelo,
         lease_expira_em = null,
         erro = null,
         gerado_em = now(),
         atualizado_em = now()
   where licitacao_id = p_licitacao_id
     and estado = 'processando'
     and lease_id = p_lease_id
     and lease_expira_em > now();

  if not found then
    select * into v_atual
      from public.licitacoes_analises
     where licitacao_id = p_licitacao_id;
    if found
       and v_atual.estado = 'pronta'
       and v_atual.lease_id = p_lease_id then
      return;
    end if;
    raise exception 'lease da analise perdido, expirado ou substituido';
  end if;
end;
$$;

create or replace function public.falhar_analise_licitacao(
  p_licitacao_id uuid,
  p_lease_id uuid,
  p_erro text
) returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_atual public.licitacoes_analises;
begin
  update public.licitacoes_analises
     set estado = 'erro',
         lease_expira_em = null,
         erro = left(coalesce(p_erro, 'erro desconhecido'), 2000),
         atualizado_em = now()
   where licitacao_id = p_licitacao_id
     and estado = 'processando'
     and lease_id = p_lease_id;

  if not found then
    select * into v_atual
      from public.licitacoes_analises
     where licitacao_id = p_licitacao_id;
    if found
       and v_atual.estado = 'erro'
       and v_atual.lease_id = p_lease_id then
      return;
    end if;
    raise exception 'lease da analise perdido ou substituido';
  end if;
end;
$$;

revoke all on function public.buscar_chunks_analise(uuid, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.adquirir_lease_analise(uuid, text, boolean, text, text, uuid, interval)
  from public, anon, authenticated;
revoke all on function public.renovar_lease_analise(uuid, uuid, interval)
  from public, anon, authenticated;
revoke all on function public.concluir_analise_licitacao(uuid, uuid, jsonb, jsonb, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.falhar_analise_licitacao(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.buscar_chunks_analise(uuid, text, text, integer)
  to service_role;
grant execute on function public.adquirir_lease_analise(uuid, text, boolean, text, text, uuid, interval)
  to service_role;
grant execute on function public.renovar_lease_analise(uuid, uuid, interval)
  to service_role;
grant execute on function public.concluir_analise_licitacao(uuid, uuid, jsonb, jsonb, jsonb, text)
  to service_role;
grant execute on function public.falhar_analise_licitacao(uuid, uuid, text)
  to service_role;
