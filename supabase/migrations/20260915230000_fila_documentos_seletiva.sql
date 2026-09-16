-- A fila de documentos passa a atender só quem a equipe pode disputar.
--
-- Decisão de produto: o link externo de cada licitação (`url_pncp`) já existe sem
-- custo de requisição, montado dos três identificadores. A chamada `/arquivos`
-- por licitação — uma requisição cada — só se justifica onde ela muda decisão:
-- os filtros "tem edital/projeto/orçamento", os pontos de documentos no score e
-- a lista de arquivos na tela de detalhe.
--
-- Sem este corte, o catálogo nacional pretendido (~25.700 licitações) geraria
-- ~19 h de fila. Com ele, ~5.500 licitações — cerca de 21%.
--
-- DOIS CUIDADOS QUE O CORTE ÓBVIO ERRARIA:
--
-- 1. Cortar por `score >= score_minimo_recomendado` seria circular: o score
--    INCLUI os pontos de documentos, então uma licitação pode estar abaixo do
--    mínimo justamente por ainda não ter sido enriquecida — e assim nunca
--    entraria na fila que a faria cruzar o mínimo. Ela se excluiria sozinha.
--    Medido no catálogo de 15/09/2026: o corte circular deixaria 70 licitações,
--    contra 233 do corte correto. As 163 de diferença são exatamente as que
--    cruzariam o mínimo se fossem enriquecidas.
--
--    A correção é dar o benefício da dúvida pelo teto que os documentos podem
--    somar: quem está abaixo de (mínimo − peso dos documentos) não alcança o
--    mínimo nem com edital, projeto e orçamento completos.
--
-- 2. "Ainda não abriu" também entra. Uma licitação cuja proposta abre semana que
--    vem é a oportunidade mais valiosa que existe para quem precisa montar
--    proposta — excluí-la por não estar "aberta agora" inverteria o objetivo.

create or replace function public.pncp_reservar_licitacoes_documentos(
  p_limite integer default 25,
  p_validade_reserva interval default '15 minutes',
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
#variable_conflict use_column
declare
  -- Lidos da configuração, não recebidos por parâmetro: mudar o mínimo ou o peso
  -- na tela passa a redesenhar a fila sozinho, sem migração nova.
  v_corte integer;
begin
  select greatest(c.score_minimo_recomendado - c.score_peso_documentos, 0)
    into v_corte
    from public.configuracoes c
   where c.id = true;

  return query
  with alvos as (
    select l.id
      from public.licitacoes l
      left join public.documentos_estado de on de.licitacao_id = l.id
     -- Sem os três identificadores não há URL possível em `/arquivos`.
     where l.cnpj_orgao <> ''
       and l.ano_compra is not null
       and l.sequencial_compra is not null
       -- Só o que ainda dá para disputar: aberta agora ou ainda por abrir.
       -- Encerrada, cancelada e suspensa não recebem requisição.
       and public.licitacao_situacao_temporal(l.situacao_compra_id, l.data_abertura_proposta,
                                              l.data_encerramento_proposta, now())
           in ('aberta', 'nao_iniciada')
       and l.score_aderencia >= coalesce(v_corte, 0)
       and (
             de.licitacao_id is null
          or de.estado = 'pendente'
          or (de.estado = 'erro' and de.atualizado_em < now() - p_retentar_apos)
          or (de.estado = 'coletando' and de.atualizado_em < now() - p_validade_reserva)
       )
     -- Prioridade do produto: o que encerra antes primeiro, e entre iguais o que
     -- a equipe tem mais chance de querer ler.
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


-- A cobertura precisa contar a MESMA população que a fila atende, senão a tela
-- mostraria "faltam 24 mil" para uma fila que nunca vai buscá-las.
create or replace function public.documentos_cobertura()
returns jsonb
language sql
stable
as $$
  with corte as (
    select greatest(score_minimo_recomendado - score_peso_documentos, 0) as v
      from public.configuracoes where id = true
  ),
  elegiveis as (
    select l.id
      from public.licitacoes l, corte c
     where l.cnpj_orgao <> ''
       and l.ano_compra is not null
       and l.sequencial_compra is not null
       and public.licitacao_situacao_temporal(l.situacao_compra_id, l.data_abertura_proposta,
                                              l.data_encerramento_proposta, now())
           in ('aberta', 'nao_iniciada')
       and l.score_aderencia >= coalesce(c.v, 0)
  )
  select jsonb_build_object(
    'licitacoes_total', (select count(*) from public.licitacoes),
    -- Agora significa "que a fila pretende atender", não "que têm identificador".
    'elegiveis', (select count(*) from elegiveis),
    'completas', (
      select count(*) from public.documentos_estado de
       where de.estado = 'completo' and de.licitacao_id in (select id from elegiveis)
    ),
    'com_erro', (
      select count(*) from public.documentos_estado de
       where de.estado = 'erro' and de.licitacao_id in (select id from elegiveis)
    ),
    'coletando', (
      select count(*) from public.documentos_estado where estado = 'coletando'
    ),
    -- Estes seguem contando o catálogo inteiro: documento já coletado continua
    -- valendo mesmo depois que a licitação sai do recorte da fila.
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

revoke all on function public.pncp_reservar_licitacoes_documentos(integer, interval, interval)
  from public, anon, authenticated;
revoke all on function public.documentos_cobertura() from public, anon, authenticated;
