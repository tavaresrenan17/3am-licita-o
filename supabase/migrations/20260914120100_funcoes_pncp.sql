-- Funções do catálogo PNCP (Fase 1)
--
-- Todas são chamadas pelas server functions com a service role. Nenhuma fica
-- exposta a anon/authenticated: sem login, o navegador não fala com o banco.

-- ------------------------------------------------------- oportunidade aberta

-- "Aberta agora" é condição temporal, recalculada a cada consulta: um prazo
-- vence sem que o PNCP grave nada e sem evento nenhum (regra D03).
-- Decisão explícita do produto (D02): abertura inclusiva, encerramento exclusivo.
create or replace function public.licitacao_aberta(
  p_situacao integer,
  p_abertura timestamptz,
  p_encerramento timestamptz,
  p_agora timestamptz
) returns boolean
language sql
immutable
as $$
  select p_situacao = 1
     and p_abertura is not null
     and p_encerramento is not null
     and p_abertura <= p_agora
     and p_encerramento > p_agora;
$$;

-- ------------------------------------------------------------ merge de página

-- Grava uma página inteira: mescla cabeçalhos, registra histórico, avança o
-- checkpoint do segmento e os contadores do job — tudo na mesma transação.
create or replace function public.pncp_merge_page(
  p_segmento_id uuid,
  p_pagina integer,
  p_total_paginas integer,
  p_total_registros integer,
  p_rows jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_seg public.ingestao_segmentos;
  v_recebidos integer := 0;
  v_novos integer := 0;
  v_atualizados integer := 0;
  v_ignorados integer := 0;
  v_concluido boolean;
begin
  select * into v_seg from public.ingestao_segmentos where id = p_segmento_id for update;
  if not found then
    raise exception 'Segmento % não encontrado', p_segmento_id;
  end if;

  -- Reentrega da mesma página não repete efeito nenhum (regras I06 e I08):
  -- nem linhas, nem contadores, nem histórico.
  if p_pagina < v_seg.proxima_pagina then
    return jsonb_build_object(
      'aplicado', false,
      'motivo', 'pagina_ja_aplicada',
      'recebidos', 0, 'novos', 0, 'atualizados', 0, 'ignorados', 0,
      'proxima_pagina', v_seg.proxima_pagina,
      'segmento_concluido', v_seg.status = 'concluido'
    );
  end if;

  if p_pagina > v_seg.proxima_pagina then
    raise exception 'Página % fora de ordem: o segmento % espera a página %',
      p_pagina, p_segmento_id, v_seg.proxima_pagina;
  end if;

  with entrada as (
    -- Deduplica dentro do lote: ON CONFLICT não aceita a mesma linha duas vezes.
    select distinct on (r.numero_controle_pncp) r.*
      from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(
        numero_controle_pncp text,
        cnpj_orgao text,
        orgao text,
        orgao_subrogado_cnpj text,
        orgao_subrogado_nome text,
        ano_compra integer,
        sequencial_compra integer,
        numero_compra text,
        processo text,
        unidade_nome text,
        codigo_unidade text,
        uf text,
        municipio text,
        codigo_ibge text,
        objeto text,
        informacao_complementar text,
        modalidade_id integer,
        modalidade_nome text,
        modo_disputa_id integer,
        situacao_compra_id integer,
        situacao_nome text,
        srp boolean,
        valor_total_estimado numeric,
        data_publicacao timestamptz,
        data_abertura_proposta timestamptz,
        data_encerramento_proposta timestamptz,
        data_atualizacao_global timestamptz,
        link_sistema_origem text,
        url_pncp text,
        categoria text,
        score_aderencia integer,
        source_hash text,
        fetched_at timestamptz,
        observado_em_proposta_at timestamptz
      )
     order by r.numero_controle_pncp
  ),
  merged as (
    insert into public.licitacoes as l (
      numero_controle_pncp, cnpj_orgao, orgao, orgao_subrogado_cnpj, orgao_subrogado_nome,
      ano_compra, sequencial_compra, numero_compra, processo, unidade_nome, codigo_unidade,
      uf, municipio, codigo_ibge, objeto, informacao_complementar, modalidade_id,
      modalidade_nome, modo_disputa_id, situacao_compra_id, situacao_nome, srp,
      valor_total_estimado, data_publicacao, data_abertura_proposta,
      data_encerramento_proposta, data_atualizacao_global, link_sistema_origem, url_pncp,
      categoria, score_aderencia, source_hash, fetched_at, observado_em_proposta_at, synced_at
    )
    select
      e.numero_controle_pncp, coalesce(e.cnpj_orgao, ''), coalesce(e.orgao, ''),
      e.orgao_subrogado_cnpj, e.orgao_subrogado_nome, e.ano_compra, e.sequencial_compra,
      e.numero_compra, e.processo, e.unidade_nome, e.codigo_unidade, e.uf, e.municipio,
      e.codigo_ibge, coalesce(e.objeto, ''), e.informacao_complementar, e.modalidade_id,
      e.modalidade_nome, e.modo_disputa_id, e.situacao_compra_id, e.situacao_nome, e.srp,
      e.valor_total_estimado, e.data_publicacao, e.data_abertura_proposta,
      e.data_encerramento_proposta, e.data_atualizacao_global, e.link_sistema_origem,
      e.url_pncp, coalesce(e.categoria, 'Outros'), coalesce(e.score_aderencia, 0),
      coalesce(e.source_hash, ''), coalesce(e.fetched_at, now()), e.observado_em_proposta_at,
      now()
      from entrada e
    on conflict (numero_controle_pncp) do update set
      cnpj_orgao = excluded.cnpj_orgao,
      orgao = excluded.orgao,
      orgao_subrogado_cnpj = excluded.orgao_subrogado_cnpj,
      orgao_subrogado_nome = excluded.orgao_subrogado_nome,
      ano_compra = excluded.ano_compra,
      sequencial_compra = excluded.sequencial_compra,
      numero_compra = excluded.numero_compra,
      processo = excluded.processo,
      unidade_nome = excluded.unidade_nome,
      codigo_unidade = excluded.codigo_unidade,
      uf = excluded.uf,
      municipio = excluded.municipio,
      codigo_ibge = excluded.codigo_ibge,
      objeto = excluded.objeto,
      informacao_complementar = excluded.informacao_complementar,
      modalidade_id = excluded.modalidade_id,
      modalidade_nome = excluded.modalidade_nome,
      modo_disputa_id = excluded.modo_disputa_id,
      situacao_compra_id = excluded.situacao_compra_id,
      situacao_nome = excluded.situacao_nome,
      srp = excluded.srp,
      valor_total_estimado = excluded.valor_total_estimado,
      data_publicacao = excluded.data_publicacao,
      data_abertura_proposta = excluded.data_abertura_proposta,
      data_encerramento_proposta = excluded.data_encerramento_proposta,
      data_atualizacao_global = excluded.data_atualizacao_global,
      link_sistema_origem = excluded.link_sistema_origem,
      url_pncp = excluded.url_pncp,
      categoria = excluded.categoria,
      score_aderencia = excluded.score_aderencia,
      source_hash = excluded.source_hash,
      fetched_at = excluded.fetched_at,
      observado_em_proposta_at =
        coalesce(excluded.observado_em_proposta_at, l.observado_em_proposta_at),
      synced_at = now(),
      updated_at = now()
      -- status_interno, observacoes e prioridade NÃO aparecem aqui de propósito:
      -- são da equipe e sobrevivem a toda sincronização.
    where l.source_hash is distinct from excluded.source_hash
      -- Resposta atrasada não regride um cabeçalho mais novo (regra I09).
      and (
        l.data_atualizacao_global is null
        or excluded.data_atualizacao_global is null
        or excluded.data_atualizacao_global >= l.data_atualizacao_global
      )
    returning l.id, (xmax = 0) as inserido
  ),
  historico as (
    insert into public.licitacoes_historico (licitacao_id, texto, origem)
    select m.id,
           case when m.inserido then 'Importada do PNCP' else 'Atualizada pelo PNCP' end,
           'pncp'
      from merged m
    returning 1
  )
  select
    (select count(*) from entrada),
    (select count(*) from merged where inserido),
    (select count(*) from merged where not inserido)
    into v_recebidos, v_novos, v_atualizados;

  v_ignorados := v_recebidos - v_novos - v_atualizados;

  -- Mesmo sem mudança de conteúdo, avançar "quando foi visto" — é o que
  -- sustenta a idade da cobertura mostrada na tela.
  update public.licitacoes l
     set synced_at = now(),
         observado_em_proposta_at =
           coalesce(e.observado_em_proposta_at, l.observado_em_proposta_at)
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
      as e(numero_controle_pncp text, observado_em_proposta_at timestamptz)
   where l.numero_controle_pncp = e.numero_controle_pncp;

  -- Página cheia pode ser a última; página vazia coerente encerra o segmento.
  v_concluido := (p_total_paginas is not null and p_pagina >= p_total_paginas)
                 or v_recebidos = 0;

  update public.ingestao_segmentos
     set proxima_pagina = p_pagina + 1,
         paginas_aplicadas = paginas_aplicadas + 1,
         registros_recebidos = registros_recebidos + v_recebidos,
         total_paginas_observado = coalesce(p_total_paginas, total_paginas_observado),
         total_registros_observado = coalesce(p_total_registros, total_registros_observado),
         status = case when v_concluido then 'concluido' else 'executando' end,
         ultimo_erro = null,
         atualizado_em = now()
   where id = p_segmento_id;

  update public.sincronizacoes s
     set paginas_consultadas = s.paginas_consultadas + 1,
         registros_consultados = s.registros_consultados + v_recebidos,
         total_novos = s.total_novos + v_novos,
         total_atualizados = s.total_atualizados + v_atualizados,
         total_ignorados = s.total_ignorados + v_ignorados,
         fonte_observada_em = now(),
         segmentos_concluidos = (
           select count(*) from public.ingestao_segmentos g
            where g.sincronizacao_id = s.id and g.status = 'concluido'
         )
   where s.id = v_seg.sincronizacao_id;

  return jsonb_build_object(
    'aplicado', true,
    'recebidos', v_recebidos,
    'novos', v_novos,
    'atualizados', v_atualizados,
    'ignorados', v_ignorados,
    'proxima_pagina', p_pagina + 1,
    'segmento_concluido', v_concluido
  );
end;
$$;

-- Guarda o JSON original. O schema pncp_private não é exposto pela API, então
-- a gravação passa por esta função — o payload bruto nunca vira endpoint REST.
create or replace function public.pncp_salvar_payloads(
  p_endpoint text,
  p_itens jsonb
) returns integer
language sql
-- Roda como o dono: o service_role não tem USAGE no schema privado, e não deve
-- ter. search_path fixo é obrigatório em SECURITY DEFINER.
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

-- --------------------------------------------------------- consulta da tela

-- Filtra o catálogo inteiro no banco e devolve só a página pedida. A tela nunca
-- recebe mil linhas para filtrar no navegador (critério 5 do arquivo 05 §2).
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

-- ------------------------------------------------------------- dashboard ---

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

create or replace function public.opcoes_filtros()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'ufs', coalesce((select jsonb_agg(distinct uf order by uf) from public.licitacoes
                      where uf is not null), '[]'::jsonb),
    'municipios', coalesce((select jsonb_agg(distinct municipio order by municipio)
                             from public.licitacoes where municipio is not null), '[]'::jsonb),
    'orgaos', coalesce((select jsonb_agg(distinct orgao order by orgao)
                         from public.licitacoes where orgao <> ''), '[]'::jsonb),
    'categorias', coalesce((select jsonb_agg(distinct categoria order by categoria)
                             from public.licitacoes), '[]'::jsonb),
    'modalidades', coalesce((select jsonb_agg(distinct modalidade_nome order by modalidade_nome)
                              from public.licitacoes where modalidade_nome is not null), '[]'::jsonb)
  );
$$;

-- -------------------------------------------------- campos internos da equipe

create or replace function public.atualizar_licitacao_interna(
  p_id uuid,
  p_status_interno text default null,
  p_prioridade boolean default null,
  p_observacoes text default null,
  p_historico text default null
) returns jsonb
language plpgsql
as $$
declare
  v_linha public.licitacoes;
begin
  update public.licitacoes
     set status_interno = coalesce(p_status_interno, status_interno),
         prioridade = coalesce(p_prioridade, prioridade),
         observacoes = coalesce(p_observacoes, observacoes),
         updated_at = now()
   where id = p_id
  returning * into v_linha;

  if not found then
    raise exception 'Licitação % não encontrada', p_id;
  end if;

  if p_historico is not null then
    insert into public.licitacoes_historico (licitacao_id, texto, origem)
    values (p_id, p_historico, 'equipe');
  end if;

  return to_jsonb(v_linha) - 'objeto_fts';
end;
$$;

-- ------------------------------------------------------------------ acesso --

-- Sem login, ninguém executa estas funções pelo navegador: só a service role.
revoke all on function public.pncp_merge_page(uuid, integer, integer, integer, jsonb)
  from public, anon, authenticated;
revoke all on function public.buscar_licitacoes(jsonb, text, text, integer, integer, timestamptz, integer)
  from public, anon, authenticated;
revoke all on function public.metricas_dashboard(timestamptz, integer)
  from public, anon, authenticated;
revoke all on function public.opcoes_filtros() from public, anon, authenticated;
revoke all on function public.pncp_salvar_payloads(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.atualizar_licitacao_interna(uuid, text, boolean, text, text)
  from public, anon, authenticated;
revoke all on function public.licitacao_aberta(integer, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
