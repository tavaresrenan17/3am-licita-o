-- Telemetria do pipeline PNCP, separada da latência informada pelo cliente HTTP.
-- A gravação é agregada a cada cinco páginas e no fim do tick, evitando uma ida
-- adicional ao banco para cada página processada.
alter table public.sincronizacoes
  add column if not exists pipeline_transformacao_total_ms bigint not null default 0,
  add column if not exists pipeline_payload_total_ms bigint not null default 0,
  add column if not exists pipeline_merge_total_ms bigint not null default 0,
  add column if not exists pipeline_administracao_db_total_ms bigint not null default 0;

create table if not exists public.sincronizacao_metricas_eventos (
  id uuid primary key,
  sincronizacao_id uuid not null references public.sincronizacoes(id) on delete cascade,
  criado_em timestamptz not null default now()
);

alter table public.sincronizacao_metricas_eventos enable row level security;
revoke all on table public.sincronizacao_metricas_eventos from public, anon, authenticated;

create index if not exists idx_sincronizacao_metricas_eventos_sincronizacao
  on public.sincronizacao_metricas_eventos (sincronizacao_id);

create or replace function public.pncp_registrar_metricas_pipeline(
  p_evento_id uuid,
  p_sincronizacao_id uuid,
  p_requisicoes integer,
  p_sucessos integer,
  p_tentativas integer,
  p_timeouts integer,
  p_erros_429 integer,
  p_erros_5xx integer,
  p_falhas_outros integer,
  p_latencia_total_ms bigint,
  p_latencia_max_ms integer,
  p_falhas_consecutivas integer,
  p_reiniciar_consecutivas boolean,
  p_transformacao_ms bigint,
  p_salvar_payload_ms bigint,
  p_merge_ms bigint,
  p_administracao_db_ms bigint
) returns void
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_inseridos integer;
begin
  insert into public.sincronizacao_metricas_eventos (id, sincronizacao_id)
  values (p_evento_id, p_sincronizacao_id)
  on conflict (id) do nothing;
  get diagnostics v_inseridos = row_count;

  if v_inseridos = 0 then
    return;
  end if;

  update public.sincronizacoes
     set api_requisicoes_total = api_requisicoes_total + greatest(coalesce(p_requisicoes, 0), 0),
         api_requisicoes_sucesso = api_requisicoes_sucesso + greatest(coalesce(p_sucessos, 0), 0),
         api_tentativas_total = api_tentativas_total + greatest(coalesce(p_tentativas, 0), 0),
         api_timeouts = api_timeouts + greatest(coalesce(p_timeouts, 0), 0),
         api_erros_429 = api_erros_429 + greatest(coalesce(p_erros_429, 0), 0),
         api_erros_5xx = api_erros_5xx + greatest(coalesce(p_erros_5xx, 0), 0),
         api_falhas_outros = api_falhas_outros + greatest(coalesce(p_falhas_outros, 0), 0),
         api_latencia_total_ms = api_latencia_total_ms + greatest(coalesce(p_latencia_total_ms, 0), 0),
         api_latencia_max_ms = greatest(api_latencia_max_ms, coalesce(p_latencia_max_ms, 0)),
         api_falhas_consecutivas =
           case when coalesce(p_reiniciar_consecutivas, false)
                then greatest(coalesce(p_falhas_consecutivas, 0), 0)
                else api_falhas_consecutivas + greatest(coalesce(p_falhas_consecutivas, 0), 0)
           end,
         api_ultima_resposta_em =
           case when coalesce(p_requisicoes, 0) > 0 then now() else api_ultima_resposta_em end,
         pipeline_transformacao_total_ms =
           pipeline_transformacao_total_ms + greatest(coalesce(p_transformacao_ms, 0), 0),
         pipeline_payload_total_ms =
           pipeline_payload_total_ms + greatest(coalesce(p_salvar_payload_ms, 0), 0),
         pipeline_merge_total_ms =
           pipeline_merge_total_ms + greatest(coalesce(p_merge_ms, 0), 0),
         pipeline_administracao_db_total_ms =
           pipeline_administracao_db_total_ms + greatest(coalesce(p_administracao_db_ms, 0), 0)
   where id = p_sincronizacao_id;
end;
$function$;

revoke all on function public.pncp_registrar_metricas_pipeline(
  uuid, uuid, integer, integer, integer, integer, integer, integer, integer,
  bigint, integer, integer, boolean, bigint, bigint, bigint, bigint
) from public, anon, authenticated;
