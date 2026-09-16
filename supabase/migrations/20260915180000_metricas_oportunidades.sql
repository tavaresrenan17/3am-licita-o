-- Métricas do painel "Oportunidades" no Dashboard.
--
-- Mesma assinatura da função anterior, então é substituição limpa: não há
-- sobrecarga a dropar nem chamada a ajustar.
--
-- Três acréscimos, todos porque a tela precisa dizer a verdade:
--
-- `novas_hoje` — "novas do dia" não é "novas na última sincronização". Se a
--   última rodada foi anteontem, o segundo número responde outra pergunta.
-- `encerrando_48h` — urgência real de quem monta proposta; `prazo_proximo`
--   (7 dias) é planejamento, não urgência.
-- `por_uf` — o painel agrupa por estado. `top_locais` é município/UF e não
--   serve: somaria "São Paulo/SP" e "Campinas/SP" como lugares diferentes.

create or replace function public.metricas_dashboard(
  p_agora timestamptz default now(),
  p_score_minimo integer default 60
) returns jsonb
language sql
stable
as $$
  with base as (select * from public.licitacoes),
  ultima as (
    select * from public.sincronizacoes
     where status <> 'falhou' and finalizado_em is not null
     order by finalizado_em desc limit 1
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'nao_analisadas', (select count(*) from base where status_interno = 'nova'),
    'novas_ultima_sync', coalesce((select total_novos from ultima), 0),
    'atualizadas_ultima_sync', coalesce((select total_atualizados from ultima), 0),
    -- Dia civil de Brasília, não as últimas 24 h: "do dia" é o que a equipe lê
    -- no calendário. Em UTC a virada aconteceria três horas antes.
    'novas_hoje', (
      select count(*) from base
       where created_at >= date_trunc('day', p_agora at time zone 'America/Sao_Paulo')
                           at time zone 'America/Sao_Paulo'
    ),
    -- Fronteira de calendário, não "agora + 48 h": o card abre a lista pelo
    -- filtro `limite_ate`, que é por dia. Com limites diferentes, o número e a
    -- lista que ele abre discordariam por algumas horas — e a equipe confiaria
    -- menos nos dois.
    'encerrando_ate_amanha', (
      select count(*) from base
       where public.licitacao_aberta(situacao_compra_id, data_abertura_proposta,
                                     data_encerramento_proposta, p_agora)
         and data_encerramento_proposta
             < ((date_trunc('day', p_agora at time zone 'America/Sao_Paulo')::date + 2)::timestamp
                at time zone 'America/Sao_Paulo')
    ),
    'prazo_proximo', (
      select count(*) from base
       where public.licitacao_aberta(situacao_compra_id, data_abertura_proposta,
                                     data_encerramento_proposta, p_agora)
         and data_encerramento_proposta <= p_agora + interval '7 days'
    ),
    'abertas', (
      select count(*) from base
       where public.licitacao_aberta(situacao_compra_id, data_abertura_proposta,
                                     data_encerramento_proposta, p_agora)
    ),
    'valor_total', coalesce((select sum(valor_total_estimado) from base), 0),
    -- Quantas linhas não têm valor divulgado: o total acima não as inclui.
    'sem_valor', (select count(*) from base where valor_total_estimado is null),
    'prioritarias', (select count(*) from base where prioridade),
    'recomendadas', (select count(*) from base where score_aderencia >= p_score_minimo),
    -- Só o que ainda dá para disputar: um ranking de estados que conta licitação
    -- encerrada não ajuda a decidir onde buscar trabalho.
    'por_uf', coalesce((
      select jsonb_agg(x) from (
        select coalesce(uf, '—') as uf, count(*) as qtd
          from base
         where public.licitacao_aberta(situacao_compra_id, data_abertura_proposta,
                                       data_encerramento_proposta, p_agora)
         group by 1 order by qtd desc, uf asc
      ) x
    ), '[]'::jsonb),
    'top_locais', coalesce((
      select jsonb_agg(x) from (
        select coalesce(municipio, '—') || ' / ' || coalesce(uf, '—') as local, count(*) as qtd
          from base group by 1 order by qtd desc, local asc limit 6
      ) x
    ), '[]'::jsonb),
    'por_categoria', coalesce((
      select jsonb_agg(x) from (
        select categoria, count(*) as qtd from base group by 1 order by qtd desc, categoria asc
      ) x
    ), '[]'::jsonb),
    'ultima_sync', (select to_jsonb(u) from ultima u),
    'consultado_em', p_agora
  );
$$;

revoke all on function public.metricas_dashboard(timestamptz, integer)
  from public, anon, authenticated;


-- ------------------------------------------------------------ filtro novo ---
--
-- `criadas_de` fecha o laço do card "Novas do dia": sem ele o número existe mas
-- não abre — clicar levaria a uma lista que não corresponde ao que foi contado.
-- Mesma assinatura de antes, então é substituição limpa.

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
