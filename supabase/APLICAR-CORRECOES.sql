-- 3AM LICITACAO - correcoes pos-migracao
-- Cole no SQL Editor do projeto sfjesuzvsupjlkzeijzc e execute uma vez.
-- 1) libera a gravacao do payload bruto; 2) corrige a acentuacao das sementes.

-- ===================== 20260914143000_corrige_payloads_privado.sql =====================
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


-- ===================== 20260914150000_corrige_acentuacao_sementes.sql =====================
-- Correção de acentuação dos dados semeados.
--
-- O arquivo consolidado que foi colado no SQL Editor foi montado lendo os .sql
-- sem declarar UTF-8, e o PowerShell interpretou os bytes como ANSI. Resultado
-- no banco: "LeilÃ£o - EletrÃ´nico", "PregÃ£o", "construÃ§Ã£o".
--
-- As licitações vindas do PNCP não foram afetadas: elas entram pelo Node, que
-- trata JSON em UTF-8 do começo ao fim. Só as sementes do SQL precisam disto.

update public.modalidades m
   set nome = v.nome,
       atualizado_em = now()
  from (values
    (1, 'Leilão - Eletrônico'),
    (2, 'Diálogo Competitivo'),
    (3, 'Concurso'),
    (4, 'Concorrência - Eletrônica'),
    (5, 'Concorrência - Presencial'),
    (6, 'Pregão - Eletrônico'),
    (7, 'Pregão - Presencial'),
    (8, 'Dispensa'),
    (9, 'Inexigibilidade'),
    (10, 'Manifestação de Interesse'),
    (11, 'Pré-qualificação'),
    (12, 'Credenciamento'),
    (13, 'Leilão - Presencial'),
    (14, 'Inaplicabilidade da Licitação'),
    (15, 'Chamada pública'),
    (16, 'Concorrência – Eletrônica Internacional'),
    (17, 'Concorrência – Presencial Internacional'),
    (18, 'Pregão – Eletrônico Internacional'),
    (19, 'Pregão – Presencial Internacional')
  ) as v(id, nome)
 where m.id = v.id
   and m.nome is distinct from v.nome;

update public.configuracoes
   set palavras_chave = array[
     'obra', 'construção', 'reforma', 'engenharia', 'pavimentação', 'drenagem',
     'manutenção predial', 'infraestrutura', 'escola', 'hospital', 'praça',
     'urbanização', 'terraplenagem', 'concreto', 'cobertura', 'elétrica', 'hidráulica'
   ],
       atualizado_em = now()
 where id = true;

-- O score das licitações já gravadas foi calculado com as palavras corrompidas,
-- então nenhuma delas casou com "construção" ou "pavimentação". Zerar o hash
-- força o próximo merge a regravar e recalcular o score, em vez de considerar
-- que nada mudou.
update public.licitacoes
   set source_hash = ''
 where source_hash <> '';

