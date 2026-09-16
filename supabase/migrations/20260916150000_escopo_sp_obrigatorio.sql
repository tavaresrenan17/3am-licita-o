-- O produto começa por SP. Antes desta migração, `ufs_coleta = '{}'` era
-- interpretado como Brasil inteiro, o que podia multiplicar silenciosamente o
-- custo da descoberta e, principalmente, do incremental por modalidade.

update public.configuracoes
   set ufs_coleta = array['SP'],
       atualizado_em = now()
 where cardinality(ufs_coleta) = 0;

alter table public.configuracoes
  alter column ufs_coleta set default array['SP'];

alter table public.configuracoes
  drop constraint if exists configuracoes_ufs_coleta_obrigatoria;

alter table public.configuracoes
  add constraint configuracoes_ufs_coleta_obrigatoria
  check (cardinality(ufs_coleta) > 0);

comment on column public.configuracoes.ufs_coleta is
  'UFs consultadas no PNCP. Ao menos uma é obrigatória; coleta nacional não é inferida de lista vazia.';
