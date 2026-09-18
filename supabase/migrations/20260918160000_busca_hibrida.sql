-- Busca híbrida: RRF sobre ranking lexical e ranking vetorial.
--
-- A ordem das operações é o ponto que a ADR-001 cobra. Os filtros relacionais
-- são aplicados ANTES do vetor, sobre a tabela inteira. Filtrar depois de uma
-- busca aproximada é o que faz índice HNSW devolver menos de k resultados — a
-- ADR chama isso de "completude sob filtros" e exige top-10 completo sempre que
-- houver 10 candidatos elegíveis.
--
-- A fusão é Reciprocal Rank Fusion: score = Σ peso / (K + posição). O RRF
-- combina rankings de escalas incomparáveis (ts_rank e distância cosseno) sem
-- precisar normalizar nenhum dos dois.

create index if not exists licitacoes_embedding_hnsw_idx
  on public.licitacoes_embedding
  using hnsw (embedding extensions.halfvec_cosine_ops)
  with (m = 16, ef_construction = 64);

create index if not exists documento_chunks_hnsw_idx
  on public.documento_chunks
  using hnsw (embedding extensions.halfvec_cosine_ops)
  with (m = 16, ef_construction = 64);

create or replace function public.buscar_licitacoes_hibrida(
  p_filtros jsonb default '{}'::jsonb,
  p_embedding text default null,
  p_ordenar text default 'relevancia',
  p_direcao text default 'desc',
  p_limite integer default 25,
  p_deslocamento integer default 0,
  p_agora timestamptz default now(),
  p_score_minimo integer default 60
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $$
#variable_conflict use_column
declare
  v_limite integer := least(greatest(coalesce(p_limite, 25), 1), 200);
  v_offset integer := greatest(coalesce(p_deslocamento, 0), 0);
  v_termo text := nullif(btrim(coalesce(p_filtros->>'palavra_chave', '')), '');
  v_ativo boolean;
  v_peso_lex numeric;
  v_peso_vet numeric;
  v_vetor extensions.halfvec(1024);
  -- Constante do RRF. 60 é o valor da literatura original, nomeado aqui para
  -- que mudá-lo seja uma decisão e não um acidente.
  k_rrf constant integer := 60;
begin
  select hibrido_ativo, peso_lexical, peso_vetorial
    into v_ativo, v_peso_lex, v_peso_vet
    from public.configuracao_busca where id = 1;

  -- Sem flag, sem vetor de consulta ou sem termo: o caminho é o lexical de
  -- sempre. Degradar é o comportamento correto, não uma exceção.
  if not coalesce(v_ativo, false) or p_embedding is null or v_termo is null then
    return public.buscar_licitacoes(
      p_filtros,
      case when p_ordenar = 'relevancia' then 'data_encerramento_proposta' else p_ordenar end,
      p_direcao, p_limite, p_deslocamento, p_agora, p_score_minimo
    ) || jsonb_build_object('modo', 'lexical');
  end if;

  v_vetor := p_embedding::extensions.halfvec(1024);

  return (
    with elegiveis as (
      -- PASSO 1: todos os filtros relacionais, sobre a tabela inteira.
      select l.*
        from public.licitacoes l
       where (nullif(p_filtros->>'uf', '') is null or l.uf = p_filtros->>'uf')
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
         and (nullif(p_filtros->>'valor_min', '') is null
              or l.valor_total_estimado >= (p_filtros->>'valor_min')::numeric)
         and (nullif(p_filtros->>'valor_max', '') is null
              or l.valor_total_estimado <= (p_filtros->>'valor_max')::numeric)
         and (nullif(p_filtros->>'publicacao_de', '') is null
              or l.data_publicacao >= ((p_filtros->>'publicacao_de')::date)::timestamp
                                       at time zone 'America/Sao_Paulo')
         and (nullif(p_filtros->>'publicacao_ate', '') is null
              or l.data_publicacao < (((p_filtros->>'publicacao_ate')::date + 1)::timestamp
                                       at time zone 'America/Sao_Paulo'))
    ),
    -- PASSO 2a: ranking lexical dentro do conjunto elegível.
    lexical as (
      select e.id,
             row_number() over (
               order by ts_rank(e.objeto_fts,
                        websearch_to_tsquery('portuguese'::regconfig, v_termo)) desc, e.id
             ) as posicao
        from elegiveis e
       where e.busca_texto ilike '%' || v_termo || '%'
          or e.objeto_fts @@ websearch_to_tsquery('portuguese'::regconfig, v_termo)
       limit 200
    ),
    -- PASSO 2b: ranking vetorial pelo objeto da licitação.
    vetorial_objeto as (
      select e.id,
             row_number() over (order by emb.embedding <=> v_vetor) as posicao
        from elegiveis e
        join public.licitacoes_embedding emb on emb.licitacao_id = e.id
       order by emb.embedding <=> v_vetor
       limit 200
    ),
    -- PASSO 2c: ranking vetorial pelos trechos de edital. Uma licitação entra
    -- pelo seu melhor trecho, e é esse trecho que a interface mostra.
    melhor_chunk as (
      select distinct on (c.licitacao_id)
             c.licitacao_id, c.texto, (c.embedding <=> v_vetor) as distancia
        from public.documento_chunks c
        join elegiveis e on e.id = c.licitacao_id
       order by c.licitacao_id, c.embedding <=> v_vetor
    ),
    vetorial_chunk as (
      select m.licitacao_id as id, m.texto,
             row_number() over (order by m.distancia) as posicao
        from melhor_chunk m
       order by m.distancia
       limit 200
    ),
    -- PASSO 3: fusão RRF. Um ranking em que o id não aparece simplesmente não
    -- contribui — por isso o coalesce entra no id, e não no score.
    fundido as (
      select coalesce(l.id, vo.id, vc.id) as id,
             coalesce(v_peso_lex, 1) / (k_rrf + l.posicao) as parcela_lex,
             coalesce(v_peso_vet, 1) / (k_rrf + vo.posicao) as parcela_obj,
             coalesce(v_peso_vet, 1) / (k_rrf + vc.posicao) as parcela_chunk,
             vc.texto as trecho,
             (vo.id is not null or vc.id is not null) as origem_semantica
        from lexical l
        full outer join vetorial_objeto vo on vo.id = l.id
        full outer join vetorial_chunk vc on vc.id = coalesce(l.id, vo.id)
    ),
    pontuado as (
      select f.id,
             coalesce(f.parcela_lex, 0) + coalesce(f.parcela_obj, 0)
               + coalesce(f.parcela_chunk, 0) as score_rrf,
             f.trecho,
             f.origem_semantica
        from fundido f
       where f.id is not null
    ),
    ordenado as (
      select e.*, p.score_rrf, p.trecho, p.origem_semantica
        from pontuado p
        join elegiveis e on e.id = p.id
       order by p.score_rrf desc, e.data_encerramento_proposta asc nulls last, e.id
    ),
    pagina as (
      select * from ordenado limit v_limite offset v_offset
    )
    select jsonb_build_object(
      'modo', 'hibrido',
      'total', (select count(*) from ordenado),
      'itens', coalesce(
        (select jsonb_agg(to_jsonb(p.*) - 'objeto_fts' - 'busca_texto' order by p.score_rrf desc)
           from pagina p),
        '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.buscar_licitacoes_hibrida(jsonb, text, text, text, integer, integer, timestamptz, integer)
  from public, anon;
grant execute on function public.buscar_licitacoes_hibrida(jsonb, text, text, text, integer, integer, timestamptz, integer)
  to authenticated, service_role;
