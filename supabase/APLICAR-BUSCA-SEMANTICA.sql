-- Cole este arquivo inteiro no SQL Editor do projeto sfjesuzvsupjlkzeijzc.
-- Gerado de supabase/migrations/20260918150000_busca_semantica.sql

-- Busca semântica: bytes do PNCP viram texto, texto vira vetor.
--
-- A ADR-001 mantém o lexical como caminho de produção; nada aqui muda a
-- `buscar_licitacoes` existente. Estas tabelas só acumulam matéria-prima.

create extension if not exists vector with schema extensions;

-- halfvec exige pgvector 0.7. Falhar aqui, alto e claro, é melhor do que
-- descobrir no meio da carga que o tipo não existe.
do $$
declare v text;
begin
  select extversion into v from pg_extension where extname = 'vector';
  if v is null then
    raise exception 'extensão vector não instalada';
  end if;
  if string_to_array(v, '.')::int[] < array[0,7,0] then
    raise exception 'pgvector % é anterior a 0.7 e não tem halfvec', v;
  end if;
end $$;

-- ---------------------------------------------------------------- arquivos

create table if not exists public.documentos_arquivo (
  documento_id uuid primary key
    references public.documentos_licitacao (id) on delete cascade,
  licitacao_id uuid not null
    references public.licitacoes (id) on delete cascade,
  estado text not null default 'pendente'
    check (estado in ('pendente','baixando','extraido','sem_texto','grande_demais','erro')),
  nome_arquivo text,
  extensao text,
  mime_detectado text,
  bytes bigint,
  sha256 text,
  paginas integer,
  chars integer,
  densidade_chars_pagina numeric,
  texto text,
  tentativas integer not null default 0,
  erro text,
  atualizado_em timestamptz not null default now()
);

create index if not exists documentos_arquivo_fila_idx
  on public.documentos_arquivo (estado, atualizado_em);
create index if not exists documentos_arquivo_licitacao_idx
  on public.documentos_arquivo (licitacao_id);

comment on column public.documentos_arquivo.mime_detectado is
  'Tipo REAL do arquivo. O PNCP devolve sempre application/octet-stream: medido em 18/09/2026. O sinal confiável é o content-disposition e os magic bytes.';
comment on column public.documentos_arquivo.densidade_chars_pagina is
  'chars/páginas. Abaixo de 200 o PDF é imagem escaneada: vira sem_texto e não entra no vetorial.';

-- -------------------------------------------------------------- embeddings

create table if not exists public.licitacoes_embedding (
  licitacao_id uuid primary key
    references public.licitacoes (id) on delete cascade,
  embedding extensions.halfvec(1024) not null,
  modelo text not null,
  versao_modelo text not null,
  origem_hash text not null,
  criado_em timestamptz not null default now()
);

create table if not exists public.documento_chunks (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null
    references public.documentos_licitacao (id) on delete cascade,
  licitacao_id uuid not null
    references public.licitacoes (id) on delete cascade,
  ordem integer not null,
  texto text not null,
  embedding extensions.halfvec(1024) not null,
  modelo text not null,
  versao_modelo text not null,
  origem_hash text not null,
  criado_em timestamptz not null default now(),
  unique (documento_id, ordem)
);

create index if not exists documento_chunks_licitacao_idx
  on public.documento_chunks (licitacao_id);

comment on column public.licitacoes_embedding.origem_hash is
  'sha256 do texto que gerou o vetor. Mudou o objeto, muda o hash, e a linha é recalculada — exigência da ADR-001.';

-- ------------------------------------------------------------------- flag

create table if not exists public.configuracao_busca (
  id integer primary key default 1 check (id = 1),
  hibrido_ativo boolean not null default false,
  peso_lexical numeric not null default 1.0,
  peso_vetorial numeric not null default 1.0,
  modelo_esperado text not null default 'bge-m3',
  atualizado_em timestamptz not null default now()
);

insert into public.configuracao_busca (id) values (1) on conflict (id) do nothing;

comment on table public.configuracao_busca is
  'Flag no banco, e não em env, para desligar o híbrido sem deploy — requisito de rollback da ADR-001.';

alter table public.documentos_arquivo enable row level security;
alter table public.licitacoes_embedding enable row level security;
alter table public.documento_chunks enable row level security;
alter table public.configuracao_busca enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'configuracao_busca'
       and policyname = 'configuracao_busca_leitura'
  ) then
    create policy configuracao_busca_leitura on public.configuracao_busca
      for select to anon, authenticated using (true);
  end if;
end $$;

-- Reserva arquivos para download. Mesma disciplina do worker de documentos:
-- lease por tempo, skip locked, e a rede acontece fora da transação.
create or replace function public.reservar_arquivos(
  p_limite integer default 20,
  p_validade_reserva interval default '15 minutes',
  p_retentar_apos interval default '6 hours'
) returns table (
  documento_id uuid,
  licitacao_id uuid,
  url text,
  nome text,
  tipo_documento text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
#variable_conflict use_column
begin
  return query
  with alvos as (
    select d.id, d.licitacao_id, d.url, d.nome, d.tipo_documento
      from public.documentos_licitacao d
      left join public.documentos_arquivo a on a.documento_id = d.id
     where d.url is not null
       and d.ativo
       and (
             a.documento_id is null
          or a.estado = 'pendente'
          or (a.estado = 'erro' and a.atualizado_em < now() - p_retentar_apos)
          or (a.estado = 'baixando' and a.atualizado_em < now() - p_validade_reserva)
       )
     order by case when d.tipo_documento = 'edital' then 0 else 1 end, d.id
     limit greatest(p_limite, 0)
     for update of d skip locked
  ),
  reservados as (
    insert into public.documentos_arquivo as a (documento_id, licitacao_id, estado, atualizado_em)
    select al.id, al.licitacao_id, 'baixando', now() from alvos al
    on conflict (documento_id) do update
      set estado = 'baixando', atualizado_em = now(), erro = null,
          tentativas = a.tentativas + 1
    returning a.documento_id
  )
  select al.id, al.licitacao_id, al.url, al.nome, al.tipo_documento
    from alvos al
    join reservados r on r.documento_id = al.id;
end;
$$;

-- Commit do download. Um arquivo problemático não derruba o lote.
create or replace function public.gravar_arquivo(
  p_documento_id uuid,
  p_estado text,
  p_nome_arquivo text default null,
  p_extensao text default null,
  p_mime text default null,
  p_bytes bigint default null,
  p_sha256 text default null,
  p_paginas integer default null,
  p_chars integer default null,
  p_texto text default null,
  p_erro text default null
) returns void
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  update public.documentos_arquivo
     set estado = p_estado,
         nome_arquivo = coalesce(p_nome_arquivo, nome_arquivo),
         extensao = coalesce(p_extensao, extensao),
         mime_detectado = coalesce(p_mime, mime_detectado),
         bytes = coalesce(p_bytes, bytes),
         sha256 = coalesce(p_sha256, sha256),
         paginas = coalesce(p_paginas, paginas),
         chars = coalesce(p_chars, chars),
         densidade_chars_pagina =
           case when coalesce(p_paginas, 0) > 0
                then round(coalesce(p_chars, 0)::numeric / p_paginas, 1)
                else densidade_chars_pagina end,
         texto = coalesce(p_texto, texto),
         erro = p_erro,
         atualizado_em = now()
   where documento_id = p_documento_id;
$$;

revoke all on function public.reservar_arquivos(integer, interval, interval)
  from public, anon, authenticated;
revoke all on function public.gravar_arquivo(uuid, text, text, text, text, bigint, text, integer, integer, text, text)
  from public, anon, authenticated;
