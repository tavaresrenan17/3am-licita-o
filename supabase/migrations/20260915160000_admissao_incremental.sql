-- Política de admissão: impedir que o incremental infle o catálogo.
--
-- `/contratacoes/atualizacao` devolve tudo que MUDOU na janela, e mudança
-- inclui contratação encerrada há anos que sofreu um ajuste qualquer. Medição
-- de 15/09/2026, amostra de 50 registros por consulta:
--
--   DF · Pregão Eletrônico      → 27 abertas, 23 já encerradas, 13 de 2024–2025
--   Nacional · Concorrência El.  → 25 abertas, 25 já encerradas
--
-- Ou seja, cerca de metade da janela é proposta encerrada. A rota não oferece
-- filtro por data de publicação nem por situação (arquivo 01 §2), então não há
-- como pedir "só o recente" à fonte: a seleção tem de acontecer na gravação.
--
-- O princípio que resolve sem perder nada:
--
--   O incremental existe para MANTER FRESCO o que já temos.
--   Descobrir oportunidade nova é trabalho de `/contratacoes/proposta`.
--
-- Daí a regra: registro já no catálogo é sempre atualizado — é exatamente para
-- isso que o ciclo existe, e uma licitação que a equipe acompanha não pode
-- deixar de receber mudanças. Registro desconhecido só entra se a proposta
-- ainda estiver aberta.

-- Contador próprio. Sem ele, o registro barrado cairia em `total_ignorados`,
-- que significa "chegou e não mudou" — a tela diria "sem mudança" para algo que
-- nem entrou. O arquivo 08 §4 proíbe transformar "não coletado" em "não
-- corresponde": se decidimos não admitir, temos de dizer isso em voz alta.
alter table public.sincronizacoes
  add column if not exists total_nao_admitidos integer not null default 0;

comment on column public.sincronizacoes.total_nao_admitidos is
  'Registros que a fonte devolveu e o catálogo recusou por política de admissão. Não é "não mudou" nem "não existe": é escolha nossa, e precisa aparecer na tela.';

-- Um parâmetro com default criaria SOBRECARGA, não substituição: ficariam duas
-- `pncp_merge_page` e a chamada de 5 argumentos viraria ambígua. Dropar primeiro.
drop function if exists public.pncp_merge_page(uuid, integer, integer, integer, jsonb);

create or replace function public.pncp_merge_page(
  p_segmento_id uuid,
  p_pagina integer,
  p_total_paginas integer,
  p_total_registros integer,
  p_rows jsonb,
  -- 'todas'   → grava tudo que chegou (descoberta por propostas).
  -- 'abertas' → registro novo só entra com proposta em aberto (incremental).
  p_admissao text default 'todas'
) returns jsonb
language plpgsql
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

  -- Reentrega da mesma página não repete efeito nenhum (regras I06 e I08):
  -- nem linhas, nem contadores, nem histórico.
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
  -- O EXISTS enxerga o catálogo ANTES das inserções deste mesmo statement:
  -- num único comando, todos os CTEs leem o mesmo snapshot. É o que se quer —
  -- "já conhecido" significa conhecido antes desta página.
  admitidas as (
    select e.* from entrada e
     where p_admissao = 'todas'
        -- Já acompanhamos: atualizar é o objetivo do ciclo incremental.
        or exists (
             select 1 from public.licitacoes l
              where l.numero_controle_pncp = e.numero_controle_pncp
           )
        -- Sem data de encerramento não há como julgar. Admitir, porque
        -- descartar em silêncio viraria "não sei" em "não serve".
        or e.data_encerramento_proposta is null
        or e.data_encerramento_proposta > now()
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
    (select count(*) from admitidas),
    (select count(*) from merged where inserido),
    (select count(*) from merged where not inserido)
    into v_recebidos, v_admitidos, v_novos, v_atualizados;

  v_nao_admitidos := v_recebidos - v_admitidos;
  -- "Ignorado" continua significando "chegou, foi admitido e não mudou".
  v_ignorados := v_admitidos - v_novos - v_atualizados;

  -- Mesmo sem mudança de conteúdo, avançar "quando foi visto" — é o que
  -- sustenta a idade da cobertura mostrada na tela. Só alcança linhas que já
  -- existem, então o que não foi admitido não é afetado.
  update public.licitacoes l
     set synced_at = now(),
         observado_em_proposta_at =
           coalesce(e.observado_em_proposta_at, l.observado_em_proposta_at)
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
      as e(numero_controle_pncp text, observado_em_proposta_at timestamptz)
   where l.numero_controle_pncp = e.numero_controle_pncp;

  -- Página cheia pode ser a última; página vazia coerente encerra o segmento.
  -- Usa o recebido da fonte, não o admitido: uma página inteira recusada pela
  -- política não significa que a paginação acabou.
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
         total_nao_admitidos = s.total_nao_admitidos + v_nao_admitidos,
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
    'nao_admitidos', v_nao_admitidos,
    'proxima_pagina', p_pagina + 1,
    'segmento_concluido', v_concluido
  );
end;
$$;

revoke all on function public.pncp_merge_page(uuid, integer, integer, integer, jsonb, text)
  from public, anon, authenticated;
