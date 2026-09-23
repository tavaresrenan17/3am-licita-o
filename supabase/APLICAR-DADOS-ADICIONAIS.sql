-- ==============================================================================
-- DADOS ADICIONAIS DA LICITAÇÃO
-- Prazo de entrega, prazo de pagamento, validade da proposta, pregoeiro,
-- contato e endereços não vêm nos dados estruturados do PNCP: estão só no texto
-- do edital. A IA extrai uma vez por licitação e o resultado fica aqui, para a
-- aba "Dados adicionais" abrir instantânea nas visitas seguintes.
--
-- Mesmo desenho de `licitacoes_analises`: RLS sem policy, acesso só pelo
-- servidor com a chave de serviço.
-- ==============================================================================

create table if not exists public.licitacoes_dados_adicionais (
  licitacao_id uuid primary key
    references public.licitacoes (id) on delete cascade,
  dados jsonb not null,
  -- Documentos cujo texto alimentou a extração (auditoria e reextração).
  documentos jsonb not null default '[]'::jsonb,
  modelo text,
  extrator_versao text not null,
  gerado_em timestamptz not null default now()
);

alter table public.licitacoes_dados_adicionais enable row level security;
revoke all on table public.licitacoes_dados_adicionais from public, anon, authenticated;
