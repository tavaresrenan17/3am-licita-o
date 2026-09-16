-- Catálogo PNCP → Supabase (Fase 1)
--
-- Decisões refletidas aqui:
-- * Identidade canônica é `numero_controle_pncp` (arquivo 08 §6).
-- * CNPJ, código IBGE e código de unidade são TEXTO: preservam zeros à esquerda
--   e o CNPJ alfanumérico da v2.5 do manual.
-- * Valor estimado é numeric e pode ser NULL (desconhecido/sigiloso). Nunca zero
--   por conveniência.
-- * Datas de proposta são timestamptz; a conversão do horário de Brasília é
--   feita na aplicação antes de gravar.
-- * Campos internos da equipe (status_interno, observacoes, prioridade) vivem na
--   mesma linha, mas a sincronização não os toca.
-- * O app não tem login: RLS fica ATIVO e SEM POLÍTICAS, de modo que a chave
--   publicável do navegador não lê nem grava nada. O acesso acontece apenas
--   pelas server functions, que usam a service role.

create schema if not exists pncp_private;

-- ---------------------------------------------------------------- domínios --

create table if not exists public.modalidades (
  id integer primary key,
  nome text not null,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);

comment on table public.modalidades is
  'Domínio oficial de modalidades (GET /api/pncp/v1/modalidades). Fotografia de 11/09/2026; atualizar pela fonte, não fixar enum no código.';

insert into public.modalidades (id, nome) values
  (1, 'Leilão - Eletrônico'),
  (2, 'Diálogo Competitivo'),
  (3, 'Concurso'),
  (4, 'Concorrência - Eletrônica'),
  (5, 'Concorrência - Presencial'),
  (6, 'Pregão - Eletrônico'),
  (7, 'Pregão - Presencial'),
  (8, 'Dispensa'),
  (9, 'Inexigibilidade'),
  (10, 'Manifestação de Interesse'),
  (11, 'Pré-qualificação'),
  (12, 'Credenciamento'),
  (13, 'Leilão - Presencial'),
  (14, 'Inaplicabilidade da Licitação'),
  (15, 'Chamada pública'),
  (16, 'Concorrência – Eletrônica Internacional'),
  (17, 'Concorrência – Presencial Internacional'),
  (18, 'Pregão – Eletrônico Internacional'),
  (19, 'Pregão – Presencial Internacional')
on conflict (id) do nothing;

-- ---------------------------------------------------------------- catálogo --

create table if not exists public.licitacoes (
  id uuid primary key default gen_random_uuid(),
  numero_controle_pncp text not null unique,

  -- origem (só a sincronização escreve)
  cnpj_orgao text not null default '',
  orgao text not null default '',
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
  objeto text not null default '',
  informacao_complementar text,
  modalidade_id integer,
  modalidade_nome text,
  modo_disputa_id integer,
  situacao_compra_id integer,
  situacao_nome text,
  srp boolean,
  valor_total_estimado numeric(18, 4),
  data_publicacao timestamptz,
  data_abertura_proposta timestamptz,
  data_encerramento_proposta timestamptz,
  data_atualizacao_global timestamptz,
  link_sistema_origem text,
  url_pncp text,

  -- derivados locais
  categoria text not null default 'Outros',
  score_aderencia integer not null default 0,

  -- proveniência
  source_hash text not null default '',
  fetched_at timestamptz not null default now(),
  observado_em_proposta_at timestamptz,
  synced_at timestamptz not null default now(),

  -- campos internos da equipe (preservados em toda sincronização)
  status_interno text not null default 'nova'
    check (status_interno in ('nova', 'em_analise', 'interessante', 'descartada', 'proposta_enviada')),
  observacoes text not null default '',
  prioridade boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  objeto_fts tsvector generated always as (
    to_tsvector('portuguese'::regconfig, coalesce(objeto, '') || ' ' || coalesce(orgao, ''))
  ) stored
);

comment on column public.licitacoes.valor_total_estimado is
  'NULL = não divulgado. Zero vindo da fonte pode indicar orçamento sigiloso: não tratar como preço conhecido.';
comment on column public.licitacoes.observado_em_proposta_at is
  'Última vez que o registro apareceu no endpoint de propostas abertas. Não confundir com a regra local de "aberta agora".';

-- Consultas frequentes: recorte por UF/modalidade ordenado pelo prazo, e a
-- listagem geral por publicação. Sem índice parcial com now(): a função
-- precisaria ser imutável e o instante muda.
create index if not exists licitacoes_uf_modalidade_encerramento_idx
  on public.licitacoes (uf, modalidade_id, data_encerramento_proposta, numero_controle_pncp);
create index if not exists licitacoes_publicacao_idx
  on public.licitacoes (data_publicacao desc, numero_controle_pncp desc);
create index if not exists licitacoes_encerramento_idx
  on public.licitacoes (data_encerramento_proposta, numero_controle_pncp);
create index if not exists licitacoes_objeto_fts_idx
  on public.licitacoes using gin (objeto_fts);
create index if not exists licitacoes_status_interno_idx
  on public.licitacoes (status_interno);

create table if not exists public.licitacoes_historico (
  id uuid primary key default gen_random_uuid(),
  licitacao_id uuid not null references public.licitacoes (id) on delete cascade,
  em timestamptz not null default now(),
  texto text not null,
  origem text not null default 'pncp' check (origem in ('pncp', 'equipe'))
);

create index if not exists licitacoes_historico_licitacao_idx
  on public.licitacoes_historico (licitacao_id, em desc);

-- Documentos só são coletados na Fase 4 (GET .../arquivos). A tabela existe
-- desde já para a UI distinguir "sem documento" de "ainda não coletado".
create table if not exists public.documentos_licitacao (
  id uuid primary key default gen_random_uuid(),
  licitacao_id uuid not null references public.licitacoes (id) on delete cascade,
  sequencial_documento integer,
  tipo_documento text not null default 'outro'
    check (tipo_documento in ('edital', 'projeto', 'orcamento', 'anexo', 'outro')),
  tipo_documento_pncp text,
  nome text not null default '',
  url text,
  data_publicacao timestamptz,
  created_at timestamptz not null default now(),
  unique (licitacao_id, sequencial_documento)
);

create index if not exists documentos_licitacao_tipo_idx
  on public.documentos_licitacao (licitacao_id, tipo_documento);

create table if not exists public.documentos_estado (
  licitacao_id uuid primary key references public.licitacoes (id) on delete cascade,
  estado text not null default 'pendente'
    check (estado in ('pendente', 'coletando', 'completo', 'erro')),
  versao_cabecalho text,
  atualizado_em timestamptz not null default now(),
  erro text
);

comment on table public.documentos_estado is
  'Cobertura do enriquecimento de documentos. Ausência de documento não significa que a licitação não tenha edital: pode estar pendente.';

-- ------------------------------------------------------------- ingestão ----

create table if not exists public.sincronizacoes (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'em_andamento'
    check (status in ('em_andamento', 'concluido', 'concluido_com_erros', 'parcial', 'falhou')),
  escopo jsonb not null default '{}'::jsonb,
  descricao_escopo text not null default '',
  segmentos_planejados integer not null default 0,
  segmentos_concluidos integer not null default 0,
  paginas_consultadas integer not null default 0,
  registros_consultados integer not null default 0,
  total_novos integer not null default 0,
  total_atualizados integer not null default 0,
  total_ignorados integer not null default 0,
  total_documentos integer not null default 0,
  api_requisicoes_total integer not null default 0,
  api_requisicoes_sucesso integer not null default 0,
  api_tentativas_total integer not null default 0,
  api_timeouts integer not null default 0,
  api_erros_429 integer not null default 0,
  api_erros_5xx integer not null default 0,
  api_falhas_outros integer not null default 0,
  api_latencia_total_ms bigint not null default 0,
  api_latencia_max_ms integer not null default 0,
  api_falhas_consecutivas integer not null default 0,
  api_ultima_resposta_em timestamptz,
  -- Instante anterior ao primeiro GET: o incremental da Fase 3 parte daqui
  -- menos a sobreposição, nunca do fim da carga (regra I18).
  bootstrap_started_at timestamptz not null default now(),
  cutoff timestamptz,
  fonte_observada_em timestamptz,
  mensagem_erro text,
  inicio_em timestamptz not null default now(),
  finalizado_em timestamptz,
  created_at timestamptz not null default now()
);

-- Impede duas sincronizações simultâneas (single-flight).
create unique index if not exists sincronizacoes_uma_em_andamento_idx
  on public.sincronizacoes ((status)) where status = 'em_andamento';

create index if not exists sincronizacoes_inicio_idx
  on public.sincronizacoes (inicio_em desc);

create table if not exists public.ingestao_segmentos (
  id uuid primary key default gen_random_uuid(),
  sincronizacao_id uuid not null references public.sincronizacoes (id) on delete cascade,
  endpoint text not null check (endpoint in ('proposta', 'publicacao', 'atualizacao')),
  -- Assinatura cobre escopo, janela, tamanho de página e versão do planejador:
  -- mudar qualquer um cria outro segmento em vez de reusar o checkpoint (I10).
  assinatura text not null,
  descricao text not null default '',
  query jsonb not null,
  proxima_pagina integer not null default 1,
  total_paginas_observado integer,
  total_registros_observado integer,
  paginas_aplicadas integer not null default 0,
  registros_recebidos integer not null default 0,
  status text not null default 'pendente'
    check (status in ('pendente', 'executando', 'concluido', 'parcial', 'falhou')),
  tentativas integer not null default 0,
  ultimo_erro text,
  atualizado_em timestamptz not null default now(),
  unique (sincronizacao_id, assinatura)
);

create index if not exists ingestao_segmentos_pendentes_idx
  on public.ingestao_segmentos (sincronizacao_id, status);

-- --------------------------------------------------------- configurações ---

create table if not exists public.configuracoes (
  id boolean primary key default true check (id),
  ufs_coleta text[] not null default array['SP'] check (cardinality(ufs_coleta) > 0),
  modalidades_coleta integer[] not null default '{}',
  horizonte_dias integer not null default 30 check (horizonte_dias between 1 and 365),
  palavras_chave text[] not null default array[
    'obra', 'construção', 'reforma', 'engenharia', 'pavimentação', 'drenagem',
    'manutenção predial', 'infraestrutura', 'escola', 'hospital', 'praça',
    'urbanização', 'terraplenagem', 'concreto', 'cobertura', 'elétrica', 'hidráulica'
  ],
  score_peso_palavras integer not null default 45,
  score_peso_documentos integer not null default 30,
  score_peso_valor integer not null default 17,
  score_minimo_recomendado integer not null default 60,
  itens_por_pagina integer not null default 25,
  colunas_visiveis text[] not null default array[
    'orgao', 'local', 'objeto', 'valor', 'publicacao', 'limite', 'modalidade',
    'status_pncp', 'status_interno', 'categoria', 'docs'
  ],
  atualizado_em timestamptz not null default now()
);

insert into public.configuracoes (id) values (true) on conflict (id) do nothing;

-- ------------------------------------------------------------ payload bruto -

create table if not exists pncp_private.payloads (
  id bigint generated always as identity primary key,
  numero_controle_pncp text not null,
  endpoint text not null,
  hash text not null,
  payload jsonb not null,
  coletado_em timestamptz not null default now(),
  unique (numero_controle_pncp, hash)
);

comment on table pncp_private.payloads is
  'JSON original recebido do PNCP, fora da API pública. Serve para auditoria e reprocessamento sem nova transferência.';

-- ------------------------------------------------------------------ acesso --

alter table public.licitacoes enable row level security;
alter table public.licitacoes_historico enable row level security;
alter table public.documentos_licitacao enable row level security;
alter table public.documentos_estado enable row level security;
alter table public.sincronizacoes enable row level security;
alter table public.ingestao_segmentos enable row level security;
alter table public.configuracoes enable row level security;
alter table public.modalidades enable row level security;
alter table pncp_private.payloads enable row level security;

-- Nenhuma política é criada de propósito: sem login, o navegador não deve
-- alcançar as tabelas. Todo acesso passa pelas server functions com a service
-- role, que ignora RLS. Quando houver login, criar políticas explícitas aqui.
revoke all on schema pncp_private from anon, authenticated;
revoke all on all tables in schema pncp_private from anon, authenticated;
