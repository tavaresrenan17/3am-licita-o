-- Fase 3: sincronização incremental por atualização global.
--
-- A rota é `GET /v1/contratacoes/atualizacao`, com dataInicial, dataFinal e
-- modalidade OBRIGATÓRIAS (arquivo 01 §2). Isso muda o custo do ciclo: cada UF
-- vira uma partição por modalidade, então o número de requisições cresce com o
-- domínio de modalidades, não com o tamanho do catálogo.
--
-- O que o arquivo 03 §4 exige e esta migração torna possível:
-- - progresso por partição, com a fronteira avançando só quando todas as
--   páginas daquela partição tiveram commit;
-- - guardar separadamente "consultado em", "última data fechada percorrida",
--   "dia corrente provisório" e "última atualização observada";
-- - nunca tratar o fim do job como "sincronizado até agora".

-- Um job de descoberta e um de atualização respondem perguntas diferentes e a
-- tela precisa distingui-los no histórico.
alter table public.sincronizacoes
  add column if not exists tipo text not null default 'descoberta';

alter table public.sincronizacoes drop constraint if exists sincronizacoes_tipo_check;
alter table public.sincronizacoes add constraint sincronizacoes_tipo_check
  check (tipo in ('descoberta', 'incremental'));


-- -------------------------------------------------------------- cobertura ---
--
-- Uma linha por partição percorrida. É o que responde "de quando é o que temos"
-- sem depender de nenhum job específico: jobs vão e vêm, a cobertura fica.
create table if not exists public.ingestao_cobertura (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null default 'atualizacao',
  -- Texto vazio significa nacional. Não é null de propósito: null não
  -- deduplica em índice único, e "Brasil inteiro" é partição legítima, não
  -- ausência de valor.
  uf text not null default '',
  modalidade_id integer not null,

  -- Última data de calendário INTEGRALMENTE percorrida. O dia corrente não
  -- entra aqui enquanto está em andamento.
  ultima_data_fechada date,
  -- O dia corrente, que foi consultado mas continua provisório.
  dia_corrente_provisorio date,
  -- Maior dataAtualizacaoGlobal observada. É diagnóstico, nunca checkpoint:
  -- o arquivo 03 §4 proíbe usar o máximo de uma página como cobertura.
  ultima_atualizacao_observada timestamptz,
  consultado_em timestamptz,

  atualizado_em timestamptz not null default now(),
  unique (endpoint, uf, modalidade_id)
);

comment on column public.ingestao_cobertura.ultima_data_fechada is
  'Última data de calendário cujas páginas foram todas gravadas. O dia corrente nunca entra: ele permanece provisório enquanto não fecha.';

comment on column public.ingestao_cobertura.ultima_atualizacao_observada is
  'Diagnóstico. Não usar como checkpoint: max(dataAtualizacaoGlobal) de uma página não prova cobertura (arquivo 03 §4).';

alter table public.ingestao_cobertura enable row level security;


-- ------------------------------------------------------- avanço da fronteira
--
-- Recebe pronto o que cada partição fechou. Qual dia pode fechar é decidido em
-- `src/services/pncp/planner.ts` (`ultimaDataFechavel`), e não aqui, pelo mesmo
-- motivo do score: reescrever a regra em SQL criaria duas verdades que divergem
-- na primeira correção.
create or replace function public.pncp_gravar_cobertura(p_linhas jsonb)
returns integer
language sql
as $$
  with entrada as (
    -- Mantém a fronteira mais avançada quando o mesmo ciclo produziu várias
    -- janelas para a mesma partição.
    select distinct on (e.uf, e.modalidade_id) e.*
      from jsonb_to_recordset(coalesce(p_linhas, '[]'::jsonb)) as e(
        uf text,
        modalidade_id integer,
        ultima_data_fechada date,
        dia_corrente_provisorio date,
        consultado_em timestamptz
      )
     where e.modalidade_id is not null
     order by e.uf, e.modalidade_id, e.ultima_data_fechada desc nulls last
  ),
  gravados as (
    insert into public.ingestao_cobertura as c (
      endpoint, uf, modalidade_id, ultima_data_fechada, dia_corrente_provisorio,
      ultima_atualizacao_observada, consultado_em, atualizado_em
    )
    select 'atualizacao', coalesce(e.uf, ''), e.modalidade_id, e.ultima_data_fechada,
           e.dia_corrente_provisorio,
           -- Diagnóstico, calculado aqui porque sai de graça do catálogo que
           -- acabou de ser gravado — e assim a coluna não fica órfã.
           (select max(l.data_atualizacao_global)
              from public.licitacoes l
             where l.modalidade_id = e.modalidade_id
               and (coalesce(e.uf, '') = '' or l.uf = e.uf)),
           coalesce(e.consultado_em, now()), now()
      from entrada e
    on conflict (endpoint, uf, modalidade_id) do update
      -- No Postgres, greatest ignora null (ao contrário da maioria dos bancos).
      -- É exatamente o que se quer: um ciclo que não fechou dia nenhum nesta
      -- partição registra a consulta sem fazer a fronteira retroceder.
      set ultima_data_fechada = greatest(c.ultima_data_fechada, excluded.ultima_data_fechada),
          dia_corrente_provisorio = excluded.dia_corrente_provisorio,
          ultima_atualizacao_observada =
            greatest(c.ultima_atualizacao_observada, excluded.ultima_atualizacao_observada),
          consultado_em = excluded.consultado_em,
          atualizado_em = now()
    returning 1
  )
  select count(*)::integer from gravados;
$$;


-- --------------------------------------------------------------- diagnóstico
--
-- "De quando é o que temos" para a tela, sem varrer partição no cliente.
create or replace function public.cobertura_incremental()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'particoes', (select count(*) from public.ingestao_cobertura),
    -- A visão agregada não pode ultrapassar a partição mais atrasada
    -- (arquivo 03 §4, item 6): é o mínimo, nunca o máximo. E uma partição
    -- nunca coberta zera a resposta inteira — dizer "atualizado até ontem"
    -- havendo partição sem cobertura nenhuma seria promessa falsa.
    'fronteira_agregada', (
      select case
               when count(*) filter (where ultima_data_fechada is null) > 0 then null
               else min(ultima_data_fechada)
             end
        from public.ingestao_cobertura
    ),
    'particao_mais_atrasada', (
      select jsonb_build_object('uf', uf, 'modalidade_id', modalidade_id,
                                'ultima_data_fechada', ultima_data_fechada)
        from public.ingestao_cobertura
       order by ultima_data_fechada asc nulls first
       limit 1
    ),
    'nunca_cobertas', (
      select count(*) from public.ingestao_cobertura where ultima_data_fechada is null
    ),
    'consultado_em', (select max(consultado_em) from public.ingestao_cobertura),
    'agora', now()
  );
$$;


-- Mesma regra das demais: a chave publicável do navegador não alcança nada.
revoke all on function public.pncp_gravar_cobertura(jsonb) from public, anon, authenticated;
revoke all on function public.cobertura_incremental() from public, anon, authenticated;
