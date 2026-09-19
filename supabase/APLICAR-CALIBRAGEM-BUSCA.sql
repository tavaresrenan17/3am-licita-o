-- Cole no SQL Editor do projeto sfjesuzvsupjlkzeijzc.
-- Gerado de supabase/migrations/20260919150000_calibrar_busca_semantica.sql
-- Aplicar DEPOIS de APLICAR-BUSCA-HIBRIDA.sql. Cole o arquivo inteiro de uma vez.

-- Calibragem da busca semântica, agora com dado em vez de palpite.
--
-- O limiar de 0,50 saiu de UM único par medido, e a spec dizia que o
-- experimento deveria calibrá-lo. O experimento aconteceu em 19/09/2026:
-- varredura de 0,20 a 0,50 sobre as 12 consultas semente, contra o catálogo
-- real (8.489 licitações vetorizadas).
--
--   limiar   inflação mediana do total   consultas sem nenhum ganho
--   0,20             1,0x                        12 de 12
--   0,30             1,0x                        11 de 12
--   0,35             1,0x                         8 de 12
--   0,40             1,5x                         6 de 12
--   0,45             5,2x                         2 de 12
--   0,50            16,4x                         0 de 12
--
-- O caso que decide, "serviços de vigilância patrimonial", em que o lexical
-- devolve ZERO resultados: em 0,35 aparece 1 e é o certo ("Prestação de
-- serviços de vigilância e segurança patrimonial"); em 0,40 são 4, ainda com o
-- certo no topo; em 0,50 viram 62.
--
-- O contraponto, "coleta de lixo urbano", em que o lexical devolve 1: em 0,40
-- vira 4, e os três novos são cooperativas de coleta de resíduos e saco de
-- lixo — relevantes. Em 0,50 entra "KIT PARA COLETA DE URINA".
--
-- 0,40 é onde o ganho existe e o ruído ainda não entrou.

alter table public.configuracao_busca
  alter column limiar_distancia set default 0.40;

update public.configuracao_busca
   set limiar_distancia = 0.40,
       atualizado_em = now()
 where id = 1 and limiar_distancia = 0.50;

comment on column public.configuracao_busca.limiar_distancia is
  'Distância de cosseno máxima para um vetor entrar no ranking. Calibrado em 19/09/2026 varrendo 0,20 a 0,50 sobre as consultas semente: abaixo de 0,35 o vetor nao contribui, acima de 0,45 a inflacao do total passa de 5x. Reavaliar quando o modelo ou o catalogo mudarem de forma relevante.';

-- --------------------------------------------------- piso de consulta curta

-- "TR" devolve 5.869 resultados em TODOS os limiares: o ramo lexical casa a
-- substring em quase tudo, e o vetorial ainda empurra itens sem relação para o
-- topo. Duas letras não carregam sinal semântico; o que o embedding produz ali
-- é ruído com aparência de resposta.
alter table public.configuracao_busca
  add column if not exists min_chars_semantico integer not null default 4;

comment on column public.configuracao_busca.min_chars_semantico is
  'Tamanho minimo do termo para o ramo vetorial participar. Abaixo disso a busca e puramente lexical. Medido em 19/09/2026: "TR" (2 chars) trazia 10 resultados sem relacao para o topo em qualquer limiar.';

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
  v_vetor extensions.halfvec(1024);
  k_rrf constant integer := 60;
begin
  select hibrido_ativo, peso_lexical, peso_vetorial, limiar_distancia, modelo_esperado,
         min_chars_semantico
    into v_ativo, v_peso_lex, v_peso_vet, v_limiar, v_modelo, v_min_chars
    from public.configuracao_busca where id = 1;

  v_limiar := coalesce(v_limiar, 0.40);
  v_min_chars := coalesce(v_min_chars, 4);

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
    with elegiveis as (
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
