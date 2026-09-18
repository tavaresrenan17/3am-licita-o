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
--
-- INVARIANTE DESTE ARQUIVO: entre o modo híbrido e o modo lexical, a ÚNICA
-- diferença permitida é a ordenação. Os filtros do CTE `elegiveis` e as colunas
-- calculadas do CTE `ordenado` são transcrição literal de
-- `public.buscar_licitacoes` (20260918130000_busca_segura_e_indices.sql).
-- Qualquer divergência que não seja ordem de linhas é defeito: a tela promete
-- um único contrato de resultado, e a flag só troca o ranqueamento.

-- Piso de similaridade do ranking vetorial. Sem ele os CTEs vetoriais entregam
-- as 200 linhas mais próximas MESMO QUE distantes, e a contagem de resultados
-- infla com ruído que o usuário não tem como reconhecer como ruído.
--
-- ATENÇÃO AO NÚMERO: 0.50 NÃO é valor validado. Ele vem de UM único par medido
-- em 18/09/2026 com bge-m3 — "reforma de escola municipal" contra "manutenção
-- predial em unidade de ensino" deu similaridade 0,5638 (distância 0,436), e
-- contra "aquisição de medicamentos" deu 0,3756 (distância 0,624). 0,50 separa
-- esses dois casos e nada mais foi medido. Quem calibra isto de verdade é o
-- experimento da ADR-001, com as ≥100 consultas julgadas; até lá o valor é um
-- ponto de partida conservador, ajustável sem deploy.
--
-- `if not exists` porque APLICAR-BUSCA-SEMANTICA.sql já pode ter sido colado no
-- SQL Editor: este arquivo precisa ser aplicável sobre a tabela já existente.
alter table public.configuracao_busca
  add column if not exists limiar_distancia numeric not null default 0.50;

comment on column public.configuracao_busca.limiar_distancia is
  'Distância cosseno máxima aceita no ranking vetorial (menor = mais parecido). Default 0.50 derivado de UM par medido em 18/09/2026; calibração real é o experimento da ADR-001.';

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
  v_vetor extensions.halfvec(1024);
  -- Constante do RRF. 60 é o valor da literatura original, nomeado aqui para
  -- que mudá-lo seja uma decisão e não um acidente.
  k_rrf constant integer := 60;
begin
  select hibrido_ativo, peso_lexical, peso_vetorial, limiar_distancia, modelo_esperado
    into v_ativo, v_peso_lex, v_peso_vet, v_limiar, v_modelo
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

  v_limiar := coalesce(v_limiar, 0.50);
  v_vetor := p_embedding::extensions.halfvec(1024);

  return (
    with elegiveis as (
      -- PASSO 1: todos os filtros relacionais, sobre a tabela inteira.
      --
      -- Esta lista é a de `public.buscar_licitacoes` menos o predicado do termo,
      -- que é ranqueamento e vive no CTE `lexical`. Tirar um filtro daqui quebra
      -- promessa de API: `licitacoes.functions.ts` força `apenas_abertas: true`
      -- em toda requisição porque a tela não tem como renderizar edital
      -- encerrado.
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
    -- PASSO 2a: ranking lexical dentro do conjunto elegível.
    --
    -- SEM `limit`: este é o conjunto autoritativo. O híbrido nunca pode devolver
    -- menos linhas do que o lexical devolveria para a mesma consulta — capar
    -- aqui tornaria inalcançável tudo além do corte quando a flag estivesse
    -- ligada. Posições altas contribuem quase nada ao RRF (1/(60+n)), então a
    -- cauda é barata no score e essencial no `total`.
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
    -- PASSO 2b: ranking vetorial pelo objeto da licitação.
    --
    -- `modelo = v_modelo` é a guarda da spec §4[C]: vetor gerado por outro
    -- modelo não é comparável com a consulta embutida agora, e a distância
    -- resultante seria ruído com aparência de número. O piso `< v_limiar`
    -- impede que o top-200 seja preenchido por vizinhos distantes só porque
    -- alguém precisa ocupar as 200 vagas.
    vetorial_objeto as (
      select e.id,
             row_number() over (order by emb.embedding <=> v_vetor) as posicao
        from elegiveis e
        join public.licitacoes_embedding emb on emb.licitacao_id = e.id
       where emb.modelo = v_modelo
         and (emb.embedding <=> v_vetor) < v_limiar
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
       where c.modelo = v_modelo
         and (c.embedding <=> v_vetor) < v_limiar
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
    -- `aberta` e `situacao_temporal` são calculadas com a MESMA chamada e os
    -- MESMOS argumentos da `buscar_licitacoes`. Sem elas o adaptador da tela cai
    -- nos fallbacks `false`/`'indeterminada'` — valores plausíveis, e por isso
    -- um erro que ninguém veria.
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
      'total', (select count(*) from ordenado),
      -- Os três mesmos critérios de `ordenado`: empate de RRF é comum com pesos
      -- iguais, e sem o desempate a mesma requisição devolveria a página em
      -- ordem diferente a cada execução.
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

-- ---------------------------------------------------------------- índices HNSW
--
-- Ficam no FIM do arquivo de propósito, por duas razões.
--
-- (a) NENHUM caminho de consulta deste branch os usa. Os dois CTEs vetoriais
--     fazem join com `elegiveis` antes de ordenar por distância, e pré-filtragem
--     relacional força varredura exata: o planejador não tem como usar um índice
--     aproximado sobre um subconjunto arbitrário. Hoje eles são custo de
--     escrita sem retorno de leitura.
-- (b) Eles existem para quando `HIBRIDO_LIMIAR_EXATO` (spec §4[C], padrão 5.000)
--     for implementado — o limiar que decide entre varredura exata sobre um
--     conjunto pequeno e busca aproximada sobre a tabela inteira. Esse limiar
--     NÃO existe em lugar nenhum do código: a implementação atual é sempre
--     exata. Fechar essa lacuna é mudança de estratégia de consulta e precisa de
--     medição, não de retoque.
--
-- A spec §7 manda criar HNSW DEPOIS da carga inicial: construir o grafo sobre
-- tabela vazia produz grafo pior. Por isso o arquivo inteiro se aplica por
-- último, e estes dois comandos são as últimas linhas dele.
create index if not exists licitacoes_embedding_hnsw_idx
  on public.licitacoes_embedding
  using hnsw (embedding extensions.halfvec_cosine_ops)
  with (m = 16, ef_construction = 64);

create index if not exists documento_chunks_hnsw_idx
  on public.documento_chunks
  using hnsw (embedding extensions.halfvec_cosine_ops)
  with (m = 16, ef_construction = 64);
