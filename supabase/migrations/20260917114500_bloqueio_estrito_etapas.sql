-- Impede que uma segunda vaga avance para 15/30 dias enquanto ainda existir
-- qualquer segmento não concluído na menor prioridade do job. O segmento pode
-- estar em voo ou em cooldown: em ambos os casos a próxima etapa deve esperar.
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
  with etapa_atual as (
    select min(s.prioridade) as prioridade
      from public.ingestao_segmentos s
     where s.sincronizacao_id = p_sincronizacao_id
       and s.status in ('pendente', 'executando')
  ),
  alvo as (
    select s.id
      from public.ingestao_segmentos s
      join etapa_atual e on e.prioridade = s.prioridade
     where s.sincronizacao_id = p_sincronizacao_id
       and s.status in ('pendente', 'executando')
       and (s.proxima_tentativa_em is null or s.proxima_tentativa_em <= now())
       and (s.posse_expira_em is null or s.posse_expira_em < now())
     order by s.atualizado_em asc
     limit 1
     for update of s skip locked
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
