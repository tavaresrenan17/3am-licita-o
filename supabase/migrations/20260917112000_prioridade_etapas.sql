-- A descoberta progressiva precisa manter 5 dias antes de 15 e 30 mesmo após
-- reinícios, cooldowns ou mais de um worker concorrente.
alter table public.ingestao_segmentos
  add column if not exists prioridade integer not null default 100;

create index if not exists ingestao_segmentos_prioridade_idx
  on public.ingestao_segmentos (
    sincronizacao_id,
    status,
    prioridade,
    proxima_tentativa_em,
    atualizado_em
  );

create or replace function public.pncp_reservar_segmento(
  p_sincronizacao_id uuid,
  p_lease_segundos integer default 180
) returns table (
  id uuid,
  endpoint text,
  query jsonb,
  proxima_pagina integer,
  total_paginas_observado integer,
  posse_token uuid
)
language plpgsql
as $$
#variable_conflict use_column
declare
  v_token uuid := gen_random_uuid();
begin
  return query
  with alvo as (
    select s.id
      from public.ingestao_segmentos s
     where s.sincronizacao_id = p_sincronizacao_id
       and s.status in ('pendente', 'executando')
       and (s.proxima_tentativa_em is null or s.proxima_tentativa_em <= now())
       and (s.posse_expira_em is null or s.posse_expira_em < now())
     order by s.prioridade asc, s.atualizado_em asc
     limit 1
     for update skip locked
  ),
  tomado as (
    update public.ingestao_segmentos s
       set posse_token = v_token,
           posse_expira_em = now() + make_interval(secs => greatest(p_lease_segundos, 30)),
           status = 'executando',
           atualizado_em = now()
      from alvo a
     where s.id = a.id
    returning s.id, s.endpoint, s.query, s.proxima_pagina, s.total_paginas_observado
  )
  select t.id, t.endpoint, t.query, t.proxima_pagina, t.total_paginas_observado, v_token
    from tomado t;
end;
$$;

revoke all on function public.pncp_reservar_segmento(uuid, integer)
  from public, anon, authenticated;
