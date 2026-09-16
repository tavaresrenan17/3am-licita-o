-- 3AM LICITACAO - Fase 4: correcao da funcao de reserva
-- Projeto sfjesuzvsupjlkzeijzc. Cole no SQL Editor e execute uma vez.
--
-- Sintoma apos aplicar APLICAR-FASE-4.sql:
--   42702 - column reference "licitacao_id" is ambiguous
--
-- Causa: as colunas de `returns table` viram variaveis PL/pgSQL e colidem com
-- as colunas reais; o `on conflict (licitacao_id)` nao tem como ser qualificado.
-- As demais funcoes da Fase 4 foram verificadas contra o banco e estao corretas.

-- ---------------------------------------------------------------- reserva ----
--
-- Entrega um lote e marca como 'coletando' na mesma transação. Sem isso, dois
-- ticks simultâneos coletariam as mesmas licitações e gastariam o dobro de
-- requisições na fonte para gravar o mesmo resultado.
create or replace function public.pncp_reservar_licitacoes_documentos(
  p_limite integer default 25,
  -- Tick que morreu no meio deixa a linha em 'coletando' para sempre. Passado
  -- este prazo a reserva é considerada abandonada e a licitação volta à fila.
  p_validade_reserva interval default '15 minutes',
  -- Erro pode ser da fonte, não do dado: vale tentar de novo, mas não em laço.
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
-- As colunas de `returns table` viram variáveis PL/pgSQL, e todas repetem nomes
-- de colunas reais (licitacao_id, cnpj_orgao, objeto…). Sem esta diretiva, o
-- `on conflict (licitacao_id)` abaixo não tem como ser qualificado e o Postgres
-- recusa a função inteira com 42702 ("column reference is ambiguous").
-- Aqui nenhuma dessas variáveis é lida — o retorno sai por `return query` —,
-- então preferir a coluna é exatamente o que se quer.
#variable_conflict use_column
begin
  return query
  with alvos as (
    select l.id
      from public.licitacoes l
      left join public.documentos_estado de on de.licitacao_id = l.id
     -- Sem os três identificadores não há URL possível em `/arquivos`.
     where l.cnpj_orgao <> ''
       and l.ano_compra is not null
       and l.sequencial_compra is not null
       and (
             de.licitacao_id is null
          or de.estado = 'pendente'
          or (de.estado = 'erro' and de.atualizado_em < now() - p_retentar_apos)
          or (de.estado = 'coletando' and de.atualizado_em < now() - p_validade_reserva)
       )
     -- Prioridade do produto: o que ainda dá para disputar, encerrando antes, e
     -- entre iguais o que a equipe tem mais chance de querer ler.
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

revoke all on function public.pncp_reservar_licitacoes_documentos(integer, interval, interval)
  from public, anon, authenticated;
