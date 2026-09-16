-- Pré-migração: libera os nomes usados pelo catálogo novo.
--
-- Este banco já tinha `licitacoes`, `documentos_licitacao` e `sincronizacoes`
-- com outra estrutura (pncp_id, valor_estimado, data_limite_proposta…). Como a
-- migração seguinte usa `create table if not exists`, ela passaria "com
-- sucesso" sem corrigir nada e o merge quebraria na primeira gravação.
--
-- Renomear preserva todos os dados e é reversível:
--     alter table public.licitacoes_antigo rename to licitacoes;
--
-- Executar ANTES de 20260914120000_catalogo_pncp.sql.

do $$
declare
  t text;
begin
  foreach t in array array[
    'licitacoes',
    'licitacoes_historico',
    'documentos_licitacao',
    'documentos_estado',
    'sincronizacoes',
    'ingestao_segmentos',
    'configuracoes',
    'modalidades'
  ]
  loop
    -- Só renomeia o que existe e ainda não foi renomeado: rodar duas vezes não
    -- sobrescreve um backup anterior.
    if exists (
      select 1 from information_schema.tables
       where table_schema = 'public' and table_name = t
    ) and not exists (
      select 1 from information_schema.tables
       where table_schema = 'public' and table_name = t || '_antigo'
    ) then
      execute format('alter table public.%I rename to %I', t, t || '_antigo');
      raise notice 'Tabela %  ->  %_antigo (dados preservados)', t, t;
    end if;
  end loop;
end $$;

-- Funções homônimas de versões anteriores impedem `create or replace` quando a
-- assinatura difere ("cannot change return type"). Removê-las deixa o caminho
-- livre; elas pertencem à estrutura que acabou de virar *_antigo.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'pncp_merge_page',
         'pncp_salvar_payloads',
         'buscar_licitacoes',
         'metricas_dashboard',
         'opcoes_filtros',
         'atualizar_licitacao_interna',
         'licitacao_aberta'
       )
  loop
    execute format('drop function if exists %s cascade', f.assinatura);
    raise notice 'Função % removida', f.assinatura;
  end loop;
end $$;
