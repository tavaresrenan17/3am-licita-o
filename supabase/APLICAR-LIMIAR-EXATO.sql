-- 3AM LICITACAO - HIBRIDO_LIMIAR_EXATO
-- Cole no SQL Editor do projeto sfjesuzvsupjlkzeijzc e execute uma vez.
-- Nao apaga nada: adiciona uma coluna de configuracao e recria a funcao de busca.
-- Gerado em 20/09/2026 01:38.

-- HIBRIDO_LIMIAR_EXATO: escolher a estratégia de consulta pelo tamanho do
-- conjunto elegível, em vez de varrer sempre de forma exata.
--
-- O que estava errado, medido em 20/09/2026: p95 de 9.287 ms contra meta de
-- 300 ms, 30 a 50x mais lento que o lexical sobre os mesmos dados. A causa não
-- era o modelo nem a fonte — era o plano de consulta. `vetorial_objeto` fazia
-- `join elegiveis`, o que obriga o Postgres a calcular a distância de todos os
-- 8.792 vetores; `melhor_chunk` era pior, um `distinct on` sobre os 10.424
-- chunks SEM limite. Os dois índices HNSW existiam sem servir consulta
-- nenhuma: eram custo de escrita puro.
--
-- A spec §4[C] já previa a saída, que nunca foi implementada. Agora:
--
--   elegíveis <= limiar_exato  ->  pré-filtra e varre o subconjunto. Exato, sem
--                                  perda de recall, e rápido porque o conjunto
--                                  é pequeno.
--   elegíveis  > limiar_exato  ->  top-K aproximado pelo índice sobre a tabela
--                                  inteira, cruzado com os elegíveis depois.
--                                  Nessa faixa o filtro é pouco restritivo,
--                                  então a sobrebusca cobre o que cai fora.
--
-- O predicado que decide não depende de linha: vira One-Time Filter e o ramo
-- descartado não chega a executar.
--
-- Efeito colateral declarado: acima do limiar a completude deixa de ser
-- garantida (critério 5 da ADR-001). É a troca que a própria spec autoriza, e
-- por isso o limiar é configurável, a estratégia usada volta no resultado e a
-- medição precisa ser refeita depois de aplicar.

alter table public.configuracao_busca
  add column if not exists limiar_exato integer not null default 5000;

comment on column public.configuracao_busca.limiar_exato is
  'Acima deste numero de candidatos elegiveis a busca vetorial usa o indice HNSW (aproximada); abaixo, varredura exata sobre o subconjunto. Spec 4[C], padrao 5000.';

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
  v_limiar numeric;
  v_modelo text;
  v_min_chars integer;
  v_limiar_exato integer;
  v_vetor extensions.halfvec(1024);
  k_rrf constant integer := 60;
  k_candidatos constant integer := 200;
  -- Sobrebusca do ramo aproximado: o índice devolve os mais próximos da tabela
  -- inteira e parte deles cai no filtro relacional. Pedir mais que o necessário
  -- é o que mantém o top-10 povoado depois do cruzamento.
  k_sobrebusca constant integer := 600;
begin
  select hibrido_ativo, peso_lexical, peso_vetorial, limiar_distancia, modelo_esperado,
         min_chars_semantico, limiar_exato
    into v_ativo, v_peso_lex, v_peso_vet, v_limiar, v_modelo, v_min_chars, v_limiar_exato
    from public.configuracao_busca where id = 1;

  v_limiar := coalesce(v_limiar, 0.40);
  v_min_chars := coalesce(v_min_chars, 4);
  v_limiar_exato := coalesce(v_limiar_exato, 5000);

  -- Degradar para o lexical é o comportamento correto, não uma exceção. Um
  -- termo curto demais entra aqui: o vetor dele não tem significado, e deixá-lo
  -- participar troca resultados lexicais decentes por ruído.
  if not coalesce(v_ativo, false)
     or p_embedding is null
     or v_termo is null
     or length(v_termo) < v_min_chars then
    return public.buscar_licitacoes(
      p_filtros,
      case when p_ordenar = 'relevancia' then 'data_encerramento_proposta' else p_ordenar end,
      p_direcao, p_limite, p_deslocamento, p_agora, p_score_minimo
    ) || jsonb_build_object('modo', 'lexical');
  end if;

  v_vetor := p_embedding::extensions.halfvec(1024);

  return (
    with elegiveis as materialized (
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
         and (nullif(p_filtros->>'criadas_de', '') is null
              or l.created_at >= ((p_filtros->>'criadas_de')::date)::timestamp
                                  at time zone 'America/Sao_Paulo')
         and (nullif(p_filtros->>'limite_de', '') is null
              or l.data_encerramento_proposta >= ((p_filtros->>'limite_de')::date)::timestamp
                                                  at time zone 'America/Sao_Paulo')
         and (nullif(p_filtros->>'limite_ate', '') is null
              or l.data_encerramento_proposta < (((p_filtros->>'limite_ate')::date + 1)::timestamp
                                                  at time zone 'America/Sao_Paulo'))
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
    -- Contar é barato (linhas, não vetores) e é o que decide a estratégia.
    contagem as materialized (
      select count(*)::bigint as n from elegiveis
    ),
    lexical as (
      select e.id,
             row_number() over (
               order by ts_rank(e.objeto_fts,
                        websearch_to_tsquery('portuguese'::regconfig, v_termo)) desc, e.id
             ) as posicao
        from elegiveis e
       where e.busca_texto ilike '%' || v_termo || '%'
          or e.objeto_fts @@ websearch_to_tsquery('portuguese'::regconfig, v_termo)
    ),
    -- Cada ramo do UNION ALL vai entre parênteses: ORDER BY e LIMIT soltos
    -- seriam lidos como pertencentes ao UNION inteiro, e o Postgres recusa.
    cand_objeto as (
      -- Exato: conjunto pequeno, pré-filtrado. Sem perda de recall.
      (select emb.licitacao_id as id, (emb.embedding <=> v_vetor) as distancia
         from elegiveis e
         join public.licitacoes_embedding emb on emb.licitacao_id = e.id
        where (select n from contagem) <= v_limiar_exato
          and emb.modelo = v_modelo
          and (emb.embedding <=> v_vetor) < v_limiar
        order by emb.embedding <=> v_vetor
        limit k_candidatos)
      union all
      -- Aproximado: nada de join antes do ORDER BY, que é a única forma de o
      -- HNSW ser usado. O cruzamento com os elegíveis vem depois.
      (select a.licitacao_id, a.distancia
         from (
           select emb.licitacao_id, (emb.embedding <=> v_vetor) as distancia
             from public.licitacoes_embedding emb
            where emb.modelo = v_modelo
            order by emb.embedding <=> v_vetor
            limit k_sobrebusca
         ) a
         join elegiveis e on e.id = a.licitacao_id
        where (select n from contagem) > v_limiar_exato
          and a.distancia < v_limiar)
    ),
    vetorial_objeto as (
      select id, row_number() over (order by distancia, id) as posicao
        from cand_objeto
       order by distancia
       limit k_candidatos
    ),
    cand_chunk as (
      (select c.licitacao_id, c.texto, (c.embedding <=> v_vetor) as distancia
         from public.documento_chunks c
         join elegiveis e on e.id = c.licitacao_id
        where (select n from contagem) <= v_limiar_exato
          and c.modelo = v_modelo
          and (c.embedding <=> v_vetor) < v_limiar
        order by c.embedding <=> v_vetor
        limit k_sobrebusca)
      union all
      (select a.licitacao_id, a.texto, a.distancia
         from (
           select c.licitacao_id, c.texto, (c.embedding <=> v_vetor) as distancia
             from public.documento_chunks c
            where c.modelo = v_modelo
            order by c.embedding <=> v_vetor
            limit k_sobrebusca
         ) a
         join elegiveis e on e.id = a.licitacao_id
        where (select n from contagem) > v_limiar_exato
          and a.distancia < v_limiar)
    ),
    melhor_chunk as (
      select distinct on (licitacao_id) licitacao_id, texto, distancia
        from cand_chunk
       order by licitacao_id, distancia
    ),
    vetorial_chunk as (
      select m.licitacao_id as id, m.texto,
             row_number() over (order by m.distancia, m.licitacao_id) as posicao
        from melhor_chunk m
       order by m.distancia
       limit k_candidatos
    ),
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
      select e.*,
             public.licitacao_aberta(e.situacao_compra_id, e.data_abertura_proposta,
                                     e.data_encerramento_proposta, p_agora) as aberta,
             public.licitacao_situacao_temporal(e.situacao_compra_id, e.data_abertura_proposta,
                                                e.data_encerramento_proposta, p_agora) as situacao_temporal,
             p.score_rrf, p.trecho, p.origem_semantica
        from pontuado p
        join elegiveis e on e.id = p.id
       order by p.score_rrf desc, e.data_encerramento_proposta asc nulls last, e.id
    ),
    pagina as (
      select * from ordenado limit v_limite offset v_offset
    )
    select jsonb_build_object(
      'modo', 'hibrido',
      -- Quem lê o resultado precisa saber se o top-10 é garantido ou aproximado.
      'estrategia_vetorial',
        case when (select n from contagem) <= v_limiar_exato then 'exata' else 'aproximada' end,
      'elegiveis', (select n from contagem),
      'total', (select count(*) from ordenado),
      'consultado_em', p_agora,
      'itens', coalesce(
        (select jsonb_agg(to_jsonb(p.*) - 'objeto_fts' - 'busca_texto'
                  order by p.score_rrf desc, p.data_encerramento_proposta asc nulls last, p.id)
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
