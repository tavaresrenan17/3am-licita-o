-- 3AM LICITACAO - posse de segmento (I07) e estado indeterminado (D06)
-- Projeto sfjesuzvsupjlkzeijzc. Cole no SQL Editor e execute uma vez.
-- Equivale a supabase/migrations/20260915200000_posse_e_indeterminado.sql
-- Aplicar DEPOIS de APLICAR-OPORTUNIDADES.sql.

-- Duas lacunas da auditoria contra o arquivo 05.
--
-- D06 — hoje uma licitação com data nula ou inconsistente cai em `false` no
--       `licitacao_aberta`, ou seja, o app afirma "não está aberta" onde o
--       honesto é "não dá para saber". O critério é explícito: não afirmar
--       aberta nem fechada com falsa certeza.
--
-- I07 — não havia posse de segmento. Dois ticks simultâneos (duas abas) pegavam
--       o mesmo segmento e duplicavam requisições ao PNCP — o que ficou caro
--       depois de descobrirmos o limitador de rajada da fonte.

-- ------------------------------------------------------- D06: indeterminado --
--
-- Função separada em vez de mudar `licitacao_aberta`: aquela devolve booleano e
-- é usada em filtro, onde "indeterminada" não tem como caber. Aqui o estado
-- temporal aparece por extenso, para a tela poder dizer o que de fato sabe.
create or replace function public.licitacao_situacao_temporal(
  p_situacao integer,
  p_abertura timestamptz,
  p_encerramento timestamptz,
  p_agora timestamptz
) returns text
language sql
immutable
as $$
  select case
    -- Sem prazo não há como classificar no tempo. Preservar a dúvida é o
    -- objetivo: "indeterminada" não é sinônimo de "encerrada".
    when p_abertura is null or p_encerramento is null then 'indeterminada'
    -- Abertura depois do encerramento é dado incoerente da fonte. Escolher um
    -- dos dois lados aqui seria inventar certeza sobre um registro quebrado.
    when p_abertura > p_encerramento then 'inconsistente'
    when p_situacao is distinct from 1 then 'nao_divulgada'
    when p_agora < p_abertura then 'nao_iniciada'
    when p_agora >= p_encerramento then 'encerrada'
    else 'aberta'
  end;
$$;

comment on function public.licitacao_situacao_temporal(integer, timestamptz, timestamptz, timestamptz) is
  'Estado temporal por extenso (D06). "indeterminada" e "inconsistente" existem para a tela não afirmar aberta/fechada sobre dado ausente ou incoerente.';


-- ------------------------------------------------------------ I07: posse ----
--
-- `posse_token` identifica quem está trabalhando o segmento; `posse_expira_em`
-- devolve à fila o que ficou órfão (aba fechada, processo morto).
alter table public.ingestao_segmentos
  add column if not exists posse_token uuid,
  add column if not exists posse_expira_em timestamptz;

comment on column public.ingestao_segmentos.posse_expira_em is
  'Até quando a posse vale. Passado o prazo o segmento volta à fila: sem isso um tick morto o prenderia para sempre.';

create index if not exists ingestao_segmentos_fila_idx
  on public.ingestao_segmentos (sincronizacao_id, status, posse_expira_em);

/**
 * Entrega o próximo segmento JÁ com posse, numa transação só.
 *
 * `for update skip locked` é o que impede dois ticks de pegarem o mesmo
 * segmento: o segundo pula a linha travada em vez de esperar por ela.
 *
 * Sobre a validação de posse no commit, que o I07 também pede: ela não entra em
 * `pncp_merge_page` porque a invariante de ordem de página já dá a mesma
 * garantia — um worker atrasado que tente gravar uma página anterior recebe
 * "pagina_ja_aplicada" e não produz efeito, e uma página fora de ordem levanta
 * exceção. A posse aqui resolve o desperdício de requisições, que é o dano real
 * que sobrava depois dessa invariante.
 */
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
-- As colunas de `returns table` repetem nomes de colunas reais; sem isto o
-- `set posse_token = ...` abaixo seria ambíguo (42702).
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
       and (s.posse_expira_em is null or s.posse_expira_em < now())
     order by s.atualizado_em asc
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

/** Devolve o segmento à fila assim que o tick larga dele. */
create or replace function public.pncp_liberar_segmento(p_id uuid, p_token uuid)
returns void
language sql
as $$
  update public.ingestao_segmentos
     set posse_token = null,
         posse_expira_em = null
   where id = p_id
     -- Só quem tem a posse vigente libera: um tick atrasado não pode destravar
     -- o segmento que outro já pegou.
     and posse_token = p_token;
$$;

revoke all on function public.licitacao_situacao_temporal(integer, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.pncp_reservar_segmento(uuid, integer) from public, anon, authenticated;
revoke all on function public.pncp_liberar_segmento(uuid, uuid) from public, anon, authenticated;


-- ------------------------------------------- D02: uma regra, não duas ------
--
-- Até aqui a regra "está aberta?" existia duas vezes: em `licitacao_aberta`
-- (usada pelos filtros) e reescrita em TypeScript para a tela de detalhe. O
-- critério D02 exige que a tela e o SQL concordem, e duas cópias concordam só
-- até alguém editar uma delas.
--
-- Função que recebe a linha vira coluna computada no PostgREST: a tela passa a
-- ler `aberta` e `situacao_temporal` como se fossem colunas, e some a cópia.
create or replace function public.aberta(l public.licitacoes)
returns boolean
language sql
stable
as $$
  select public.licitacao_aberta(l.situacao_compra_id, l.data_abertura_proposta,
                                 l.data_encerramento_proposta, now());
$$;

create or replace function public.situacao_temporal(l public.licitacoes)
returns text
language sql
stable
as $$
  select public.licitacao_situacao_temporal(l.situacao_compra_id, l.data_abertura_proposta,
                                            l.data_encerramento_proposta, now());
$$;

revoke all on function public.aberta(public.licitacoes) from public, anon, authenticated;
revoke all on function public.situacao_temporal(public.licitacoes) from public, anon, authenticated;


-- A lista também devolve o estado por extenso, para a tela poder distinguir
-- "encerrada" de "não dá para saber". Mesma assinatura: substituição limpa.

create or replace function public.buscar_licitacoes(
  p_filtros jsonb default '{}'::jsonb,
  p_ordenar text default 'data_encerramento_proposta',
  p_direcao text default 'asc',
  p_limite integer default 25,
  p_deslocamento integer default 0,
  p_agora timestamptz default now(),
  p_score_minimo integer default 60
) returns jsonb
language plpgsql
stable
as $$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 25), 1), 200);
  v_offset integer := greatest(coalesce(p_deslocamento, 0), 0);
  v_termo text := nullif(btrim(coalesce(p_filtros->>'palavra_chave', '')), '');
  v_itens jsonb;
  v_total bigint;
begin
  with filtrados as (
    select l.*
      from public.licitacoes l
     where (
             v_termo is null
             or l.objeto_fts @@ websearch_to_tsquery('portuguese'::regconfig, v_termo)
             or l.objeto ilike '%' || v_termo || '%'
             or l.orgao ilike '%' || v_termo || '%'
           )
       and (nullif(p_filtros->>'uf', '') is null or l.uf = p_filtros->>'uf')
       and (nullif(p_filtros->>'municipio', '') is null or l.municipio = p_filtros->>'municipio')
       and (nullif(p_filtros->>'orgao', '') is null or l.orgao = p_filtros->>'orgao')
       and (nullif(p_filtros->>'modalidade', '') is null or l.modalidade_nome = p_filtros->>'modalidade')
       and (nullif(p_filtros->>'categoria', '') is null or l.categoria = p_filtros->>'categoria')
       and (nullif(p_filtros->>'status_interno', '') is null or l.status_interno = p_filtros->>'status_interno')
       and (
             nullif(p_filtros->>'prioridade', '') is null
             or (p_filtros->>'prioridade' = 'sim' and l.prioridade)
             or (p_filtros->>'prioridade' = 'nao' and not l.prioridade)
           )
       -- Valor desconhecido (NULL) não entra em faixa de preço: a ausência do
       -- dado não prova que a licitação esteja dentro ou fora do intervalo.
       and (
             nullif(p_filtros->>'valor_min', '') is null
             or l.valor_total_estimado >= (p_filtros->>'valor_min')::numeric
           )
       and (
             nullif(p_filtros->>'valor_max', '') is null
             or l.valor_total_estimado <= (p_filtros->>'valor_max')::numeric
           )
       -- Limites de dia são do calendário de Brasília, convertidos para instantes.
       and (
             nullif(p_filtros->>'publicacao_de', '') is null
             or l.data_publicacao >= ((p_filtros->>'publicacao_de')::date)::timestamp
                                      at time zone 'America/Sao_Paulo'
           )
       and (
             nullif(p_filtros->>'publicacao_ate', '') is null
             or l.data_publicacao < (((p_filtros->>'publicacao_ate')::date + 1)::timestamp
                                      at time zone 'America/Sao_Paulo')
           )
       -- Quando a licitação entrou no NOSSO catálogo, não quando o PNCP a
       -- publicou: é o que responde "o que apareceu hoje". Uma contratação
       -- publicada semana passada pode ter chegado aqui só na sincronização de
       -- agora, e é ela que a equipe ainda não viu.
       and (
             nullif(p_filtros->>'criadas_de', '') is null
             or l.created_at >= ((p_filtros->>'criadas_de')::date)::timestamp
                                 at time zone 'America/Sao_Paulo'
           )
       and (
             nullif(p_filtros->>'limite_de', '') is null
             or l.data_encerramento_proposta >= ((p_filtros->>'limite_de')::date)::timestamp
                                                 at time zone 'America/Sao_Paulo'
           )
       and (
             nullif(p_filtros->>'limite_ate', '') is null
             or l.data_encerramento_proposta < (((p_filtros->>'limite_ate')::date + 1)::timestamp
                                                 at time zone 'America/Sao_Paulo')
           )
       and (coalesce((p_filtros->>'nao_analisadas')::boolean, false) = false
            or l.status_interno = 'nova')
       and (coalesce((p_filtros->>'recomendadas')::boolean, false) = false
            or l.score_aderencia >= p_score_minimo)
       and (coalesce((p_filtros->>'apenas_abertas')::boolean, false) = false
            or public.licitacao_aberta(l.situacao_compra_id, l.data_abertura_proposta,
                                       l.data_encerramento_proposta, p_agora))
       -- Documentos só existem a partir da Fase 4; enquanto a coleta não roda,
       -- estes filtros encontram zero linhas — a tela avisa que está pendente.
       and (coalesce((p_filtros->>'com_edital')::boolean, false) = false
            or exists (select 1 from public.documentos_licitacao d
                        where d.licitacao_id = l.id and d.tipo_documento = 'edital'))
       and (coalesce((p_filtros->>'com_projeto')::boolean, false) = false
            or exists (select 1 from public.documentos_licitacao d
                        where d.licitacao_id = l.id and d.tipo_documento = 'projeto'))
       and (coalesce((p_filtros->>'com_orcamento')::boolean, false) = false
            or exists (select 1 from public.documentos_licitacao d
                        where d.licitacao_id = l.id and d.tipo_documento = 'orcamento'))
  ),
  total as (select count(*) as c from filtrados),
  pagina as (
    select f.*,
           row_number() over (
             order by
               case when p_ordenar = 'data_encerramento_proposta' and p_direcao = 'asc'
                    then f.data_encerramento_proposta end asc nulls last,
               case when p_ordenar = 'data_encerramento_proposta' and p_direcao = 'desc'
                    then f.data_encerramento_proposta end desc nulls last,
               case when p_ordenar = 'data_publicacao' and p_direcao = 'asc'
                    then f.data_publicacao end asc nulls last,
               case when p_ordenar = 'data_publicacao' and p_direcao = 'desc'
                    then f.data_publicacao end desc nulls last,
               case when p_ordenar = 'valor_total_estimado' and p_direcao = 'asc'
                    then f.valor_total_estimado end asc nulls last,
               case when p_ordenar = 'valor_total_estimado' and p_direcao = 'desc'
                    then f.valor_total_estimado end desc nulls last,
               case when p_ordenar = 'score_aderencia' and p_direcao = 'asc'
                    then f.score_aderencia end asc nulls last,
               case when p_ordenar = 'score_aderencia' and p_direcao = 'desc'
                    then f.score_aderencia end desc nulls last,
               -- Desempate único: duas linhas com a mesma data nunca se embaralham
               -- entre páginas (regra S06).
               f.numero_controle_pncp asc
           ) as rn
      from filtrados f
  )
  select
    coalesce(
      jsonb_agg(
        (to_jsonb(p) - 'objeto_fts' - 'rn')
        || jsonb_build_object(
             'aberta',
             public.licitacao_aberta(p.situacao_compra_id, p.data_abertura_proposta,
                                     p.data_encerramento_proposta, p_agora),
             'documentos_estado',
             coalesce((select de.estado from public.documentos_estado de
                        where de.licitacao_id = p.id), 'pendente'),
             'situacao_temporal',
             public.licitacao_situacao_temporal(p.situacao_compra_id, p.data_abertura_proposta,
                                                p.data_encerramento_proposta, p_agora),
             'documentos_total',
             (select count(*) from public.documentos_licitacao d where d.licitacao_id = p.id)
           )
        order by p.rn
      ),
      '[]'::jsonb
    ),
    (select c from total)
    into v_itens, v_total
    from pagina p
   where p.rn > v_offset and p.rn <= v_offset + v_limite;

  return jsonb_build_object(
    'itens', coalesce(v_itens, '[]'::jsonb),
    'total', coalesce(v_total, 0),
    'limite', v_limite,
    'deslocamento', v_offset,
    'consultado_em', p_agora
  );
end;
$$;
