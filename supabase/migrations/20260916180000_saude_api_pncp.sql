-- Saúde agregada da API do PNCP por sincronização.
-- Uma chamada por tick consolida as páginas e tentativas observadas, evitando
-- transformar telemetria em uma escrita adicional para cada página.

alter table public.sincronizacoes
  add column if not exists api_requisicoes_total integer not null default 0,
  add column if not exists api_requisicoes_sucesso integer not null default 0,
  add column if not exists api_tentativas_total integer not null default 0,
  add column if not exists api_timeouts integer not null default 0,
  add column if not exists api_erros_429 integer not null default 0,
  add column if not exists api_erros_5xx integer not null default 0,
  add column if not exists api_falhas_outros integer not null default 0,
  add column if not exists api_latencia_total_ms bigint not null default 0,
  add column if not exists api_latencia_max_ms integer not null default 0,
  add column if not exists api_falhas_consecutivas integer not null default 0,
  add column if not exists api_ultima_resposta_em timestamptz;

create or replace function public.pncp_registrar_metricas_api(
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
  p_reiniciar_consecutivas boolean
) returns void
language plpgsql
as $function$
begin
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
         api_ultima_resposta_em = case when coalesce(p_requisicoes, 0) > 0 then now()
                                       else api_ultima_resposta_em end
   where id = p_sincronizacao_id;
end;
$function$;

revoke all on function public.pncp_registrar_metricas_api(uuid, integer, integer, integer, integer, integer, integer, integer, bigint, integer, integer, boolean) from public, anon, authenticated;
