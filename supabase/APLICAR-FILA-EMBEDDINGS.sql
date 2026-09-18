-- Cole este arquivo inteiro no SQL Editor do projeto sfjesuzvsupjlkzeijzc.
-- Aplicar DEPOIS de APLICAR-BUSCA-SEMANTICA.sql.

-- Fila de embeddings.
--
-- O gatilho de recálculo é o hash do texto de origem, não um timestamp: a
-- ADR-001 exige que mudança em objeto/órgão ou em documento enfileire novo
-- cálculo, e que vetor de modelo antigo seja contado à parte. Comparar hash
-- resolve os dois casos com uma consulta só.

create or replace function public.texto_licitacao_para_embedding(l public.licitacoes)
returns text
language sql
immutable
as $$
  select btrim(
    coalesce(l.objeto, '') || ' ' || coalesce(l.orgao, '') || ' ' || coalesce(l.municipio, ''));
$$;

create or replace function public.reservar_licitacoes_para_embedding(
  p_limite integer default 50,
  p_modelo text default 'bge-m3'
) returns table (licitacao_id uuid, texto text, origem_hash text)
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select l.id,
         public.texto_licitacao_para_embedding(l.*),
         md5(public.texto_licitacao_para_embedding(l.*))
    from public.licitacoes l
    left join public.licitacoes_embedding e on e.licitacao_id = l.id
   where length(public.texto_licitacao_para_embedding(l.*)) > 0
     and (
           e.licitacao_id is null
        or e.origem_hash is distinct from md5(public.texto_licitacao_para_embedding(l.*))
        or e.modelo is distinct from p_modelo
     )
   order by l.data_encerramento_proposta asc nulls last
   limit greatest(p_limite, 0);
$$;

create or replace function public.reservar_documentos_para_embedding(
  p_limite integer default 10,
  p_modelo text default 'bge-m3'
) returns table (documento_id uuid, licitacao_id uuid, texto text, origem_hash text)
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select a.documento_id, a.licitacao_id, a.texto, md5(a.texto)
    from public.documentos_arquivo a
   where a.estado = 'extraido'
     and a.texto is not null
     and not exists (
           select 1 from public.documento_chunks c
            where c.documento_id = a.documento_id
              and c.origem_hash = md5(a.texto)
              and c.modelo = p_modelo
     )
   order by a.atualizado_em asc
   limit greatest(p_limite, 0);
$$;

create or replace function public.gravar_embedding_licitacao(
  p_licitacao_id uuid,
  p_embedding text,
  p_modelo text,
  p_versao text,
  p_origem_hash text
) returns void
language sql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $$
  insert into public.licitacoes_embedding
    (licitacao_id, embedding, modelo, versao_modelo, origem_hash, criado_em)
  values
    (p_licitacao_id, p_embedding::extensions.halfvec(1024), p_modelo, p_versao, p_origem_hash, now())
  on conflict (licitacao_id) do update
    set embedding = excluded.embedding,
        modelo = excluded.modelo,
        versao_modelo = excluded.versao_modelo,
        origem_hash = excluded.origem_hash,
        criado_em = now();
$$;

-- Troca atômica dos chunks de um documento: apagar e inserir na mesma
-- transação, para a busca nunca enxergar um documento pela metade.
create or replace function public.gravar_chunks_documento(
  p_documento_id uuid,
  p_licitacao_id uuid,
  p_chunks jsonb,
  p_modelo text,
  p_versao text,
  p_origem_hash text
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $$
declare
  v_inseridos integer;
begin
  delete from public.documento_chunks where documento_id = p_documento_id;

  insert into public.documento_chunks
    (documento_id, licitacao_id, ordem, texto, embedding, modelo, versao_modelo, origem_hash)
  select p_documento_id,
         p_licitacao_id,
         (c->>'ordem')::integer,
         c->>'texto',
         (c->>'literal')::extensions.halfvec(1024),
         p_modelo,
         p_versao,
         p_origem_hash
    from jsonb_array_elements(p_chunks) as c;

  get diagnostics v_inseridos = row_count;
  return v_inseridos;
end;
$$;

create or replace function public.cobertura_embeddings()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select jsonb_build_object(
    'licitacoes_pesquisaveis', (select count(*) from public.licitacoes),
    'licitacoes_com_embedding', (select count(*) from public.licitacoes_embedding),
    'licitacoes_modelo_antigo',
      (select count(*) from public.licitacoes_embedding
        where modelo is distinct from
          (select modelo_esperado from public.configuracao_busca where id = 1)),
    'documentos_com_texto',
      (select count(*) from public.documentos_arquivo where estado = 'extraido'),
    'documentos_vetorizados',
      (select count(distinct documento_id) from public.documento_chunks),
    'chunks', (select count(*) from public.documento_chunks)
  );
$$;

revoke all on function public.reservar_licitacoes_para_embedding(integer, text) from public, anon, authenticated;
revoke all on function public.reservar_documentos_para_embedding(integer, text) from public, anon, authenticated;
revoke all on function public.gravar_embedding_licitacao(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.gravar_chunks_documento(uuid, uuid, jsonb, text, text, text) from public, anon, authenticated;
