-- Busca pública: contrato único, search_path seguro e índices alinhados aos filtros.
-- Esta migração não instala pgvector. Ela também remove overloads antigos sem
-- mencionar o tipo vector, portanto funciona em bancos que nunca habilitaram a extensão.

-- PostgREST não consegue escolher uma função quando há overloads com os mesmos
-- parâmetros obrigatórios. Mantemos exclusivamente o contrato público de 7 argumentos.
do $cleanup$
declare
  v_funcao regprocedure;
begin
  for v_funcao in
    select p.oid::regprocedure
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'buscar_licitacoes'
       and pg_catalog.oidvectortypes(p.proargtypes) <>
           'jsonb, text, text, integer, integer, timestamp with time zone, integer'
  loop
    execute format('drop function %s', v_funcao);
  end loop;
end
$cleanup$;

-- Falha rapidamente se uma sincronização estiver segurando lock, em vez de
-- bloquear a ingestão por tempo indeterminado. RESET evita vazar a configuração
-- para outros comandos quando o arquivo é executado no SQL Editor.
set lock_timeout = '5s';

-- Recortes mais usados na tela. Não usamos now() em predicados de índices, pois
-- o instante é mutável; data de encerramento não nula elimina linhas sem prazo.
create index if not exists licitacoes_uf_municipio_encerramento_idx
  on public.licitacoes (uf, municipio, data_encerramento_proposta, id)
  where data_encerramento_proposta is not null;

create index if not exists licitacoes_uf_modalidade_nome_encerramento_idx
  on public.licitacoes (uf, modalidade_nome, data_encerramento_proposta, id)
  where data_encerramento_proposta is not null;

create index if not exists licitacoes_uf_publicacao_idx
  on public.licitacoes (uf, data_publicacao desc, id)
  where data_publicacao is not null;

create index if not exists licitacoes_uf_valor_idx
  on public.licitacoes (uf, valor_total_estimado, id)
  where valor_total_estimado is not null;

reset lock_timeout;

create or replace function public.pncp_merge_page(
  p_segmento_id uuid,
  p_pagina integer,
  p_total_paginas integer,
  p_total_registros integer,
  p_rows jsonb,
  p_admissao text default 'todas'
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_seg public.ingestao_segmentos;
  v_recebidos integer := 0;
  v_admitidos integer := 0;
  v_nao_admitidos integer := 0;
  v_novos integer := 0;
  v_atualizados integer := 0;
  v_ignorados integer := 0;
  v_concluido boolean;
begin
  select * into v_seg from public.ingestao_segmentos where id = p_segmento_id for update;
  if not found then
    raise exception 'Segmento % não encontrado', p_segmento_id;
  end if;

  if p_admissao not in ('todas', 'abertas') then
    raise exception 'Política de admissão desconhecida: %', p_admissao;
  end if;

  -- Reentrega da mesma página não repete efeito nenhum (idempotência)
  if p_pagina < v_seg.proxima_pagina then
    return jsonb_build_object(
      'aplicado', false,
      'motivo', 'pagina_ja_aplicada',
      'recebidos', 0, 'novos', 0, 'atualizados', 0, 'ignorados', 0, 'nao_admitidos', 0,
      'proxima_pagina', v_seg.proxima_pagina,
      'segmento_concluido', v_seg.status = 'concluido'
    );
  end if;

  if p_pagina > v_seg.proxima_pagina then
    raise exception 'Página % fora de ordem: o segmento % espera a página %',
      p_pagina, p_segmento_id, v_seg.proxima_pagina;
  end if;

  with entrada as (
    -- Deduplica dentro do lote: ON CONFLICT não aceita a mesma linha duas vezes
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
  admitidas as (
    select e.* from entrada e
     where p_admissao = 'todas'
        or exists (
             select 1 from public.licitacoes l
              where l.numero_controle_pncp = e.numero_controle_pncp
           )
        or e.data_encerramento_proposta is null
        or e.data_encerramento_proposta > now()
  ),
  merged as (
    -- Único comando de gravação: merge atômico completo com atualização de timestamps
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
      from admitidas e
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
      observado_em_proposta_at = coalesce(excluded.observado_em_proposta_at, l.observado_em_proposta_at),
      synced_at = now(),
      updated_at = case
        when l.source_hash is distinct from excluded.source_hash then now()
        else l.updated_at
      end
    where l.source_hash is distinct from excluded.source_hash
      and (
        l.data_atualizacao_global is null
        or excluded.data_atualizacao_global is null
        or excluded.data_atualizacao_global >= l.data_atualizacao_global
      )
    returning l.id, (xmax = 0) as inserido
  ),
  historico as (
    -- Só gera log em histórico para NOVOS editais, evitando bloat desnecessário
    insert into public.licitacoes_historico (licitacao_id, texto, origem)
    select m.id, 'Importada do PNCP', 'pncp'
      from merged m
     where m.inserido
    returning 1
  )
  select
    (select count(*) from entrada),
    (select count(*) from admitidas),
    (select count(*) from merged where inserido),
    (select count(*) from merged where not inserido)
    into v_recebidos, v_admitidos, v_novos, v_atualizados;

  v_nao_admitidos := v_recebidos - v_admitidos;
  v_ignorados := v_admitidos - v_novos - v_atualizados;

  -- Determina se o segmento chegou ao fim
  v_concluido := (p_total_paginas is not null and p_pagina >= p_total_paginas)
                 or v_recebidos = 0;

  -- 4. Atualiza o segmento
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

  -- 5. Atualiza contadores do job de forma ATÔMICA e INCREMENTAL (sem subqueries pesadas de count)
  update public.sincronizacoes s
     set paginas_consultadas = s.paginas_consultadas + 1,
         registros_consultados = s.registros_consultados + v_recebidos,
         total_novos = s.total_novos + v_novos,
         total_atualizados = s.total_atualizados + v_atualizados,
         total_ignorados = s.total_ignorados + v_ignorados,
         total_nao_admitidos = s.total_nao_admitidos + v_nao_admitidos,
         fonte_observada_em = now(),
         segmentos_concluidos = case
           when v_concluido then s.segmentos_concluidos + 1
           else s.segmentos_concluidos
         end
   where s.id = v_seg.sincronizacao_id;

  return jsonb_build_object(
    'aplicado', true,
    'recebidos', v_recebidos,
    'novos', v_novos,
    'atualizados', v_atualizados,
    'ignorados', v_ignorados,
    'nao_admitidos', v_nao_admitidos,
    'proxima_pagina', p_pagina + 1,
    'segmento_concluido', v_concluido
  );
end;
$$;

revoke all on function public.pncp_merge_page(uuid, integer, integer, integer, jsonb, text)
  from public, anon, authenticated;

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
security definer
set search_path = pg_catalog, pg_temp
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
             or l.busca_texto ilike '%' || v_termo || '%'
             or l.objeto_fts @@ websearch_to_tsquery('portuguese'::regconfig, v_termo)
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
       and (
             nullif(p_filtros->>'valor_min', '') is null
             or l.valor_total_estimado >= (p_filtros->>'valor_min')::numeric
           )
       and (
             nullif(p_filtros->>'valor_max', '') is null
             or l.valor_total_estimado <= (p_filtros->>'valor_max')::numeric
           )
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
           public.licitacao_aberta(f.situacao_compra_id, f.data_abertura_proposta,
                                   f.data_encerramento_proposta, p_agora) as aberta,
           public.licitacao_situacao_temporal(f.situacao_compra_id, f.data_abertura_proposta,
                                              f.data_encerramento_proposta, p_agora) as situacao_temporal
      from filtrados f
     order by
       case when p_ordenar = 'data_encerramento_proposta' and p_direcao = 'asc'  then f.data_encerramento_proposta end asc nulls last,
       case when p_ordenar = 'data_encerramento_proposta' and p_direcao = 'desc' then f.data_encerramento_proposta end desc nulls last,
       case when p_ordenar = 'valor_total_estimado'       and p_direcao = 'asc'  then f.valor_total_estimado end asc nulls last,
       case when p_ordenar = 'valor_total_estimado'       and p_direcao = 'desc' then f.valor_total_estimado end desc nulls last,
       case when p_ordenar = 'data_publicacao'            and p_direcao = 'asc'  then f.data_publicacao end asc nulls last,
       case when p_ordenar = 'data_publicacao'            and p_direcao = 'desc' then f.data_publicacao end desc nulls last,
       case when p_ordenar = 'score_aderencia'            and p_direcao = 'asc'  then f.score_aderencia end asc,
       case when p_ordenar = 'score_aderencia'            and p_direcao = 'desc' then f.score_aderencia end desc,
       f.id asc
     limit v_limite offset v_offset
  )
  select
    coalesce(jsonb_agg(to_jsonb(p.*)), '[]'::jsonb),
    coalesce((select c from total), 0)
    into v_itens, v_total
    from pagina p;

  return jsonb_build_object(
    'itens', v_itens,
    'total', v_total,
    'consultado_em', p_agora
  );
end;
$$;

revoke all on function public.buscar_licitacoes(jsonb, text, text, integer, integer, timestamptz, integer)
  from public, anon, authenticated;

comment on function public.buscar_licitacoes(jsonb, text, text, integer, integer, timestamptz, integer) is
  'Contrato versionado de busca do catálogo: única assinatura exposta ao PostgREST.';

analyze public.licitacoes;
