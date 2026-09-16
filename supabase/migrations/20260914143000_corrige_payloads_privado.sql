-- Correção: a gravação do payload bruto derrubava a coleta inteira.
--
-- Sintoma observado no smoke de 14/09/2026:
--   Falha ao guardar payload bruto: permission denied for schema pncp_private (42501)
--
-- Causa: `pncp_salvar_payloads` foi criada SECURITY INVOKER, então executava
-- com os privilégios de quem chama (service_role). Um schema criado à mão não
-- concede USAGE a essa role, e o INSERT falhava. Como o worker guarda o payload
-- antes do merge, a página era descartada sem nada ser gravado.
--
-- Correção: a função passa a rodar como seu dono, com search_path fixo (evita
-- sequestro do caminho de busca em função SECURITY DEFINER). O schema continua
-- inacessível a qualquer role da API: quem entra nele é só esta função.

create or replace function public.pncp_salvar_payloads(
  p_endpoint text,
  p_itens jsonb
) returns integer
language sql
security definer
set search_path = pncp_private, public, pg_temp
as $$
  with entrada as (
    select distinct on (i.numero_controle_pncp, i.hash) i.*
      from jsonb_to_recordset(coalesce(p_itens, '[]'::jsonb)) as i(
        numero_controle_pncp text,
        hash text,
        payload jsonb
      )
     order by i.numero_controle_pncp, i.hash
  ),
  gravados as (
    insert into pncp_private.payloads (numero_controle_pncp, endpoint, hash, payload)
    select e.numero_controle_pncp, p_endpoint, e.hash, e.payload from entrada e
    on conflict (numero_controle_pncp, hash) do nothing
    returning 1
  )
  select count(*)::integer from gravados;
$$;

revoke all on function public.pncp_salvar_payloads(text, jsonb)
  from public, anon, authenticated;
