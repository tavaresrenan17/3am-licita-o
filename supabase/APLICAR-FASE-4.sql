-- 3AM LICITACAO - Fase 4: coleta de documentos
-- Projeto sfjesuzvsupjlkzeijzc. Cole no SQL Editor e execute uma vez.
-- Equivale a supabase/migrations/20260915090000_coleta_documentos.sql
-- (o CLI nao consegue aplicar: a rede local nao tem IPv6 para o Postgres).

-- Fase 4: coleta dos metadados de documentos (GET .../arquivos).
--
-- A fila é própria e independente das sincronizações de cabeçalho, como pede o
-- arquivo 08 §4: descobrir oportunidades não pode ficar preso ao enriquecimento,
-- e o enriquecimento não pode reabrir um job de coleta já encerrado.
--
-- Medições da sondagem de 14/09/2026 contra a base de Integração, que orientam
-- os tamanhos aqui: a rota responde em 45–103 ms (contra 30–60 s da listagem),
-- devolve array puro e já apareceu contratação com 120 documentos.

-- `statusAtivo` da fonte: documento substituído ou retirado continua no catálogo
-- por rastreabilidade, mas não conta para o score nem aparece na tela.
alter table public.documentos_licitacao
  add column if not exists ativo boolean not null default true;

comment on column public.documentos_licitacao.ativo is
  'Espelha statusAtivo do PNCP. Falso = documento retirado/substituído na fonte.';

-- A tela filtra por "tem edital/projeto/orçamento" e o score soma por tipo:
-- os dois só olham documento ativo.
create index if not exists documentos_licitacao_ativos_idx
  on public.documentos_licitacao (licitacao_id, tipo_documento)
  where ativo;

-- Varrer a fila é "quem ainda não foi coletado", não "tudo": sem este índice a
-- reserva faz seq scan em `licitacoes` a cada tick.
create index if not exists documentos_estado_fila_idx
  on public.documentos_estado (estado, atualizado_em);


-- ---------------------------------------------------------------- reserva ----
--
-- Entrega um lote e marca como 'coletando' na mesma transação. Sem isso, dois
-- ticks simultâneos coletariam as mesmas licitações e gastariam o dobro de
-- requisições na fonte para gravar o mesmo resultado.
create or replace function public.pncp_reservar_licitacoes_documentos(
  p_limite integer default 25,
  -- Tick que morreu no meio deixa a linha em 'coletando' para sempre. Passado
  -- este prazo a reserva é considerada abandonada e a licitação volta à fila.
  p_validade_reserva interval default '15 minutes',
  -- Erro pode ser da fonte, não do dado: vale tentar de novo, mas não em laço.
  p_retentar_apos interval default '6 hours'
) returns table (
  licitacao_id uuid,
  cnpj_orgao text,
  ano_compra integer,
  sequencial_compra integer,
  objeto text,
  modalidade_nome text,
  categoria text,
  valor_total_estimado numeric
)
language plpgsql
as $$
begin
  return query
  with alvos as (
    select l.id
      from public.licitacoes l
      left join public.documentos_estado de on de.licitacao_id = l.id
     -- Sem os três identificadores não há URL possível em `/arquivos`.
     where l.cnpj_orgao <> ''
       and l.ano_compra is not null
       and l.sequencial_compra is not null
       and (
             de.licitacao_id is null
          or de.estado = 'pendente'
          or (de.estado = 'erro' and de.atualizado_em < now() - p_retentar_apos)
          or (de.estado = 'coletando' and de.atualizado_em < now() - p_validade_reserva)
       )
     -- Prioridade do produto: o que ainda dá para disputar, encerrando antes, e
     -- entre iguais o que a equipe tem mais chance de querer ler.
     order by
       case when l.data_encerramento_proposta >= now() then 0 else 1 end,
       l.data_encerramento_proposta asc nulls last,
       l.score_aderencia desc
     limit greatest(p_limite, 0)
     for update of l skip locked
  ),
  reservados as (
    insert into public.documentos_estado as de (licitacao_id, estado, atualizado_em, erro)
    select a.id, 'coletando', now(), null from alvos a
    on conflict (licitacao_id) do update
      set estado = 'coletando', atualizado_em = now(), erro = null
    returning de.licitacao_id
  )
  select l.id, l.cnpj_orgao, l.ano_compra, l.sequencial_compra,
         l.objeto, l.modalidade_nome, l.categoria, l.valor_total_estimado
    from public.licitacoes l
    join reservados r on r.licitacao_id = l.id;
end;
$$;


-- ---------------------------------------------------------------- gravação ---
--
-- Uma transação: documentos, estado da cobertura e score recalculado. O score
-- vem pronto do worker porque a fórmula vive em `src/lib/score.ts` — reescrevê-la
-- em SQL criaria duas verdades que divergem na primeira mudança de peso.
create or replace function public.pncp_gravar_documentos(
  p_licitacao_id uuid,
  p_documentos jsonb,
  p_score integer default null,
  p_versao_cabecalho text default null
) returns jsonb
language plpgsql
as $$
declare
  v_gravados integer := 0;
  v_removidos integer := 0;
  v_ativos integer := 0;
begin
  if not exists (select 1 from public.licitacoes where id = p_licitacao_id) then
    raise exception 'Licitação % não encontrada', p_licitacao_id;
  end if;

  with entrada as (
    select distinct on (d.sequencial_documento) d.*
      from jsonb_to_recordset(coalesce(p_documentos, '[]'::jsonb)) as d(
        sequencial_documento integer,
        tipo_documento text,
        tipo_documento_pncp text,
        nome text,
        url text,
        data_publicacao timestamptz,
        ativo boolean
      )
     where d.sequencial_documento is not null
     order by d.sequencial_documento
  ),
  gravados as (
    insert into public.documentos_licitacao as dl (
      licitacao_id, sequencial_documento, tipo_documento, tipo_documento_pncp,
      nome, url, data_publicacao, ativo
    )
    select p_licitacao_id, e.sequencial_documento, coalesce(e.tipo_documento, 'outro'),
           e.tipo_documento_pncp, coalesce(e.nome, ''), e.url, e.data_publicacao,
           coalesce(e.ativo, true)
      from entrada e
    on conflict (licitacao_id, sequencial_documento) do update
      set tipo_documento      = excluded.tipo_documento,
          tipo_documento_pncp = excluded.tipo_documento_pncp,
          nome                = excluded.nome,
          url                 = excluded.url,
          data_publicacao     = excluded.data_publicacao,
          ativo               = excluded.ativo
    returning 1
  ),
  -- Documento que sumiu da resposta foi retirado na origem. Apagar mantém a
  -- tela fiel à fonte; o que foi apenas substituído volta com ativo = false.
  removidos as (
    delete from public.documentos_licitacao dl
     where dl.licitacao_id = p_licitacao_id
       and dl.sequencial_documento is not null
       and not exists (select 1 from entrada e
                        where e.sequencial_documento = dl.sequencial_documento)
    returning 1
  )
  select (select count(*) from gravados), (select count(*) from removidos)
    into v_gravados, v_removidos;

  select count(*) into v_ativos
    from public.documentos_licitacao
   where licitacao_id = p_licitacao_id and ativo;

  insert into public.documentos_estado as de (licitacao_id, estado, versao_cabecalho, atualizado_em, erro)
  values (p_licitacao_id, 'completo', p_versao_cabecalho, now(), null)
  on conflict (licitacao_id) do update
    set estado = 'completo',
        versao_cabecalho = coalesce(excluded.versao_cabecalho, de.versao_cabecalho),
        atualizado_em = now(),
        erro = null;

  -- Score só muda quando o worker mandou um: coleta sem recálculo não pode
  -- zerar a aderência de uma licitação já pontuada.
  if p_score is not null then
    update public.licitacoes
       set score_aderencia = greatest(0, least(100, p_score)),
           updated_at = now()
     where id = p_licitacao_id
       and score_aderencia is distinct from greatest(0, least(100, p_score));
  end if;

  return jsonb_build_object(
    'gravados', v_gravados,
    'removidos', v_removidos,
    'ativos', v_ativos
  );
end;
$$;


-- ------------------------------------------------------------------ falha ----
create or replace function public.pncp_falha_documentos(
  p_licitacao_id uuid,
  p_erro text,
  -- Definitiva: a fonte não tem o recurso (404) ou recusou o contrato. Fica em
  -- 'erro' e só volta à fila depois do prazo de reprocessamento.
  -- Transitória: rede ou 5xx. Volta a 'pendente' para o próximo tick pegar.
  p_definitiva boolean default false
) returns void
language sql
as $$
  insert into public.documentos_estado as de (licitacao_id, estado, atualizado_em, erro)
  values (p_licitacao_id,
          case when p_definitiva then 'erro' else 'pendente' end,
          now(),
          left(coalesce(p_erro, ''), 500))
  on conflict (licitacao_id) do update
    set estado = excluded.estado,
        atualizado_em = now(),
        erro = excluded.erro;
$$;


-- -------------------------------------------------------------- cobertura ----
--
-- A tela precisa dizer "faltam N licitações" sem varrer o catálogo no cliente.
-- Também é o que distingue "sem documento" de "ainda não coletado" no agregado.
create or replace function public.documentos_cobertura()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'licitacoes_total', (select count(*) from public.licitacoes),
    'elegiveis', (
      select count(*) from public.licitacoes
       where cnpj_orgao <> '' and ano_compra is not null and sequencial_compra is not null
    ),
    'completas', (
      select count(*) from public.documentos_estado where estado = 'completo'
    ),
    'com_erro', (
      select count(*) from public.documentos_estado where estado = 'erro'
    ),
    'coletando', (
      select count(*) from public.documentos_estado where estado = 'coletando'
    ),
    'documentos_total', (select count(*) from public.documentos_licitacao where ativo),
    'com_edital', (
      select count(distinct licitacao_id) from public.documentos_licitacao
       where ativo and tipo_documento = 'edital'
    ),
    'com_projeto', (
      select count(distinct licitacao_id) from public.documentos_licitacao
       where ativo and tipo_documento = 'projeto'
    ),
    'com_orcamento', (
      select count(distinct licitacao_id) from public.documentos_licitacao
       where ativo and tipo_documento = 'orcamento'
    ),
    'consultado_em', now()
  );
$$;


-- Mesma regra das demais: a chave publicável do navegador não alcança nada.
-- Quem chama é o servidor, com a service role.
revoke all on function public.pncp_reservar_licitacoes_documentos(integer, interval, interval)
  from public, anon, authenticated;
revoke all on function public.pncp_gravar_documentos(uuid, jsonb, integer, text)
  from public, anon, authenticated;
revoke all on function public.pncp_falha_documentos(uuid, text, boolean)
  from public, anon, authenticated;
revoke all on function public.documentos_cobertura() from public, anon, authenticated;
