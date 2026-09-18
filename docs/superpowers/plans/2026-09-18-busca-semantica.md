# Busca Semântica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao catálogo uma busca que encontra pelo significado — baixando os editais do PNCP, extraindo seu texto e indexando tudo em vetores — sem tirar o lexical do caminho de produção.

**Architecture:** Quatro unidades encadeadas: um worker baixa bytes do PNCP e extrai texto; outro worker transforma texto em vetores por um `Embedder` plugável (Ollama local, sem chave de API); uma função SQL funde ranking lexical e vetorial por RRF **depois** de aplicar os filtros relacionais; um harness mede o que a ADR-001 exige. A busca híbrida nasce atrás de feature flag desligada, e qualquer falha do provedor de embedding cai para o lexical de hoje.

**Tech Stack:** TypeScript, Node 22, Vitest, Supabase/PostgreSQL 15 + pgvector (`halfvec`, índice HNSW), `unpdf` para extração de PDF, Ollama com `bge-m3` (1024 dimensões).

**Spec:** [`docs/superpowers/specs/2026-09-18-busca-semantica-design.md`](../specs/2026-09-18-busca-semantica-design.md)

## Global Constraints

- **A ADR-001 manda.** O lexical continua sendo produção e rollback. O vetorial só entra como reordenação híbrida, atrás de flag desligada por padrão. Nenhum gate da ADR pode ser declarado cumprido sem julgamento humano de relevância.
- **Migrações não são aplicadas por CLI.** O `supabase db push` falha nesta rede com `LegacyDbConfigIpv6Error`. Toda migração ganha um arquivo gêmeo `supabase/APLICAR-*.sql` **em UTF-8**, para o usuário colar no SQL Editor do projeto `sfjesuzvsupjlkzeijzc`. Escrever com PowerShell sem declarar UTF-8 já corrompeu acentos no banco uma vez ("PregÃ£o").
- **Modelo de embedding:** `bge-m3`, **1024 dimensões**, servido por Ollama em `http://127.0.0.1:11434/api/embed`. Coluna `halfvec(1024)`, operador `halfvec_cosine_ops`. Exige pgvector ≥ 0.7.
- **Teto de bytes por arquivo:** `DOCS_MAX_BYTES`, padrão `26214400` (25 MB). Fecha o critério R04.
- **Teto de chunks por documento:** `EMBED_MAX_CHUNKS_DOC`, padrão `40`. Chunk de `1500` chars com `200` de sobreposição.
- **Densidade mínima de texto:** `< 200` chars/página marca o arquivo como `sem_texto`. Sem OCR.
- **Limite de pressão sobre o PNCP:** no máximo 2 requisições simultâneas e 2 partidas por segundo para toda a integração (arquivo 03 §8). Downloads são pesados: usar concorrência 2 e intervalo de 500 ms entre partidas.
- **Testes ficam em `src/**/*.test.ts`.** É o único padrão que o `vitest.config.ts` inclui. Teste em `scripts/` não roda no `npm test`.
- **Comentários em português**, explicando a invariante ou a medição por trás da decisão, no estilo dos arquivos existentes em `src/services/pncp/`.
- **Nada de segredo em log.** `SUPABASE_SERVICE_ROLE_KEY` nunca vai para stdout.

---

## File Structure

**Criados:**

| arquivo | responsabilidade |
|---|---|
| `supabase/migrations/20260918150000_busca_semantica.sql` | extensão, tabelas, flag |
| `supabase/APLICAR-BUSCA-SEMANTICA.sql` | gêmeo para o SQL Editor |
| `supabase/migrations/20260918160000_busca_hibrida.sql` | função de busca + índices HNSW |
| `supabase/APLICAR-BUSCA-HIBRIDA.sql` | gêmeo para o SQL Editor |
| `src/services/documentos/tipo.ts` | tipo real do arquivo a partir de três sinais |
| `src/services/documentos/download.server.ts` | baixar com teto de bytes |
| `src/services/documentos/texto.ts` | extrair texto e decidir `sem_texto` |
| `src/services/documentos/worker.arquivos.server.ts` | tick da fila de arquivos |
| `src/services/documentos/repositorio.arquivos.server.ts` | porta Supabase da fila de arquivos |
| `src/services/busca/embedder.ts` | interface `Embedder` + Ollama + falso |
| `src/services/busca/chunk.ts` | divisão de texto em chunks |
| `src/services/busca/worker.embeddings.server.ts` | tick da fila de embeddings |
| `src/services/busca/repositorio.embeddings.server.ts` | porta Supabase dos embeddings |
| `src/services/busca/hibrida.server.ts` | orquestra consulta → vetor → RPC → fallback |
| `scripts/baixar-documentos.ts` | CLI da fila de arquivos |
| `scripts/gerar-embeddings.ts` | CLI da fila de embeddings |
| `scripts/experimento-busca.mjs` | harness das métricas da ADR |
| `scripts/verificar-busca-semantica.mjs` | conferência pós-migração |
| `docs/superpowers/specs/consultas-avaliacao.json` | consultas semente + formato de julgamento |

**Modificados:** `package.json` (dependência `unpdf`, scripts npm), `src/routes/licitacoes.index.tsx` (modo de busca), `src/services/licitacoes.functions.ts` (passar o modo), `README.md`, `docs/architecture/adr-001-busca-vetorial.md` (registrar estado da implementação).

---

## Task 1: Esquema da busca semântica

**Files:**
- Create: `supabase/migrations/20260918150000_busca_semantica.sql`
- Create: `supabase/APLICAR-BUSCA-SEMANTICA.sql`
- Create: `scripts/verificar-busca-semantica.mjs`
- Modify: `package.json` (script `verificar:busca`)

**Interfaces:**
- Consumes: nada.
- Produces: tabelas `documentos_arquivo`, `licitacoes_embedding`, `documento_chunks`, `configuracao_busca`; funções `reservar_arquivos(p_limite int, p_validade_reserva interval, p_retentar_apos interval)` e `gravar_arquivo(p_documento_id uuid, p_estado text, ...)`. As funções da fila de embeddings são criadas na Task 9, não aqui.

- [ ] **Step 1: Escrever a migração**

Criar `supabase/migrations/20260918150000_busca_semantica.sql`:

```sql
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

create policy if not exists configuracao_busca_leitura on public.configuracao_busca
  for select to anon, authenticated using (true);
```

- [ ] **Step 2: Escrever as funções de fila na mesma migração**

Anexar ao mesmo arquivo:

```sql
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
          -- Alias obrigatório: uma vez que o alvo do INSERT tem `as a`, toda
          -- referência à mesma relação dentro do statement precisa usar `a`.
          -- `public.documentos_arquivo.tentativas` aqui derruba a função na
          -- primeira chamada, e o CREATE FUNCTION passa sem reclamar.
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
```

- [ ] **Step 3: Gerar o gêmeo para o SQL Editor**

O arquivo `supabase/APLICAR-BUSCA-SEMANTICA.sql` é o conteúdo da migração com um cabeçalho de instrução. Gerar **em UTF-8** com Node, nunca com `Set-Content` sem encoding:

```bash
node -e "const fs=require('fs');const sql=fs.readFileSync('supabase/migrations/20260918150000_busca_semantica.sql','utf8');const cab='-- Cole este arquivo inteiro no SQL Editor do projeto sfjesuzvsupjlkzeijzc.\n-- Gerado de supabase/migrations/20260918150000_busca_semantica.sql\n\n';fs.writeFileSync('supabase/APLICAR-BUSCA-SEMANTICA.sql',cab+sql,{encoding:'utf8'})"
```

- [ ] **Step 4: Escrever o verificador**

Criar `scripts/verificar-busca-semantica.mjs`. Ele confere o que a migração deveria ter criado, pela REST API, e é o único jeito de saber que o SQL colado pegou:

```js
/**
 * Confere o esquema da busca semântica depois que a migração foi colada no
 * SQL Editor. Somente leitura.
 *
 *   npm run verificar:busca
 */
import { readFileSync } from "node:fs";

for (const linha of readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
  if (m?.[1] && m[2] !== undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const url = process.env.SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !chave) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios");

const cabecalhos = { apikey: chave, Authorization: `Bearer ${chave}` };
let falhas = 0;

for (const tabela of ["documentos_arquivo", "licitacoes_embedding", "documento_chunks", "configuracao_busca"]) {
  const r = await fetch(`${url}/rest/v1/${tabela}?select=*&limit=1`, { headers: cabecalhos });
  const ok = r.status === 200;
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"} tabela ${tabela} (HTTP ${r.status})`);
}

const flag = await fetch(`${url}/rest/v1/configuracao_busca?select=hibrido_ativo,modelo_esperado`, { headers: cabecalhos });
console.log("configuração:", await flag.text());

process.exit(falhas === 0 ? 0 : 1);
```

- [ ] **Step 5: Registrar o script no package.json**

Em `"scripts"`, acrescentar:

```json
"verificar:busca": "node scripts/verificar-busca-semantica.mjs"
```

- [ ] **Step 6: Rodar o verificador e confirmar que FALHA**

Run: `npm run verificar:busca`
Expected: FALHA nas quatro tabelas (HTTP 404) — a migração ainda não foi aplicada. É o "vermelho" desta tarefa.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260918150000_busca_semantica.sql supabase/APLICAR-BUSCA-SEMANTICA.sql scripts/verificar-busca-semantica.mjs package.json
git commit -m "feat(busca): esquema de arquivos, embeddings e flag"
```

**Nota para quem executa:** esta tarefa termina com o esquema **não aplicado**. Avisar no relatório que `supabase/APLICAR-BUSCA-SEMANTICA.sql` precisa ser colado no SQL Editor antes das tarefas 6, 10 e 13 poderem ser validadas contra o banco. Não bloquear as tarefas seguintes por causa disso: elas são testáveis sem banco.

---

## Task 2: Tipo real do arquivo

**Files:**
- Create: `src/services/documentos/tipo.ts`
- Test: `src/services/documentos/tipo.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `detectarTipo(sinais: SinaisTipo): TipoArquivo` onde
  `interface SinaisTipo { contentDisposition?: string | null; primeirosBytes?: Uint8Array | null; nomeCatalogado?: string | null }`
  e `interface TipoArquivo { nomeArquivo: string | null; extensao: string | null; mime: string | null; suportado: boolean }`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/services/documentos/tipo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { detectarTipo } from "./tipo";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

describe("detectarTipo", () => {
  it("tira nome e extensão do content-disposition, decodificando o + como espaço", () => {
    const t = detectarTipo({
      contentDisposition: 'attachment; filename="EDITAL+DL+49-2026.pdf"',
      primeirosBytes: PDF,
    });
    expect(t.nomeArquivo).toBe("EDITAL DL 49-2026.pdf");
    expect(t.extensao).toBe("pdf");
    expect(t.mime).toBe("application/pdf");
    expect(t.suportado).toBe(true);
  });

  it("os magic bytes vencem uma extensão mentirosa", () => {
    const t = detectarTipo({
      contentDisposition: 'attachment; filename="edital.pdf"',
      primeirosBytes: ZIP,
    });
    expect(t.mime).toBe("application/zip");
    expect(t.suportado).toBe(false);
  });

  it("cai para o nome catalogado quando não há content-disposition", () => {
    const t = detectarTipo({ contentDisposition: null, primeirosBytes: PDF, nomeCatalogado: "Minuta.PDF" });
    expect(t.extensao).toBe("pdf");
    expect(t.suportado).toBe(true);
  });

  it("sem nenhum sinal confiável, não inventa tipo", () => {
    const t = detectarTipo({ contentDisposition: null, primeirosBytes: new Uint8Array([1, 2, 3, 4]) });
    expect(t.mime).toBeNull();
    expect(t.suportado).toBe(false);
  });

  it("aceita filename* no formato RFC 5987", () => {
    const t = detectarTipo({
      contentDisposition: "attachment; filename*=UTF-8''Termo%20de%20Refer%C3%AAncia.pdf",
      primeirosBytes: PDF,
    });
    expect(t.nomeArquivo).toBe("Termo de Referência.pdf");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/services/documentos/tipo.test.ts`
Expected: FAIL — `Failed to resolve import "./tipo"`.

- [ ] **Step 3: Implementar**

Criar `src/services/documentos/tipo.ts`:

```ts
/**
 * Tipo real de um arquivo baixado do PNCP.
 *
 * Medido em 18/09/2026: a rota `/arquivos/{n}` devolve SEMPRE
 * `content-type: application/octet-stream`, para PDF e para qualquer outra
 * coisa. Confiar nesse cabeçalho é não classificar nada. Os sinais que
 * realmente informam, em ordem de precedência:
 *
 *   1. magic bytes do próprio conteúdo — não mentem;
 *   2. `content-disposition: attachment; filename="..."` — é onde o nome real
 *      aparece, com `+` no lugar dos espaços;
 *   3. o nome já catalogado em `documentos_licitacao.nome`.
 */

export interface SinaisTipo {
  contentDisposition?: string | null;
  primeirosBytes?: Uint8Array | null;
  nomeCatalogado?: string | null;
}

export interface TipoArquivo {
  nomeArquivo: string | null;
  extensao: string | null;
  mime: string | null;
  /** true só para o que a v1 sabe extrair texto. */
  suportado: boolean;
}

const ASSINATURAS: ReadonlyArray<{ bytes: number[]; mime: string; extensao: string }> = [
  { bytes: [0x25, 0x50, 0x44, 0x46], mime: "application/pdf", extensao: "pdf" }, // %PDF
  { bytes: [0x50, 0x4b, 0x03, 0x04], mime: "application/zip", extensao: "zip" }, // PK..
  { bytes: [0xd0, 0xcf, 0x11, 0xe0], mime: "application/msword", extensao: "doc" },
];

const SUPORTADOS = new Set(["application/pdf"]);

function nomeDoContentDisposition(cd: string): string | null {
  const rfc5987 = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(cd);
  if (rfc5987?.[1]) {
    try {
      return decodeURIComponent(rfc5987[1].trim());
    } catch {
      return rfc5987[1].trim();
    }
  }
  const simples = /filename\s*=\s*"?([^";]+)"?/i.exec(cd);
  if (!simples?.[1]) return null;
  // O PNCP entrega espaços como `+`.
  return simples[1].trim().replace(/\+/g, " ");
}

export function detectarTipo(sinais: SinaisTipo): TipoArquivo {
  const nomeArquivo = sinais.contentDisposition
    ? nomeDoContentDisposition(sinais.contentDisposition)
    : (sinais.nomeCatalogado ?? null);

  const porAssinatura = ASSINATURAS.find((a) =>
    a.bytes.every((b, i) => sinais.primeirosBytes?.[i] === b),
  );

  const extensaoDoNome = nomeArquivo?.includes(".")
    ? (nomeArquivo.split(".").pop()!.toLowerCase() || null)
    : null;

  const mime = porAssinatura?.mime ?? null;
  const extensao = porAssinatura?.extensao ?? extensaoDoNome;

  return {
    nomeArquivo,
    extensao,
    mime,
    suportado: mime !== null && SUPORTADOS.has(mime),
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/services/documentos/tipo.test.ts`
Expected: PASS, 5 testes.

- [ ] **Step 5: Commit**

```bash
git add src/services/documentos/tipo.ts src/services/documentos/tipo.test.ts
git commit -m "feat(documentos): detectar tipo real ignorando o octet-stream do PNCP"
```

---

## Task 3: Download com teto de bytes

**Files:**
- Create: `src/services/documentos/download.server.ts`
- Test: `src/services/documentos/download.test.ts`
- Modify: `package.json` (dependência `unpdf`)

**Interfaces:**
- Consumes: `detectarTipo`, `SinaisTipo`, `TipoArquivo` de `./tipo`.
- Produces: `baixarArquivo(url: string, opcoes?: OpcoesDownload): Promise<ResultadoDownload>` com
  `interface OpcoesDownload { maxBytes?: number; fetchImpl?: typeof fetch; nomeCatalogado?: string | null }`
  e `type ResultadoDownload = { ok: true; bytes: Uint8Array; sha256: string; tipo: TipoArquivo; tamanho: number } | { ok: false; motivo: "grande_demais" | "http" | "vazio"; detalhe: string; tamanho?: number }`.
- Também exporta `class ArquivoGrandeDemais extends Error`.

- [ ] **Step 1: Instalar a dependência de extração (usada na Task 4, instalada aqui para um só commit de lockfile)**

```bash
npm install unpdf
```

- [ ] **Step 2: Escrever o teste que falha**

Criar `src/services/documentos/download.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { baixarArquivo } from "./download.server";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25]);

/** Resposta falsa que entrega o corpo em pedaços, como a rede faz. */
function respostaFalsa(pedacos: Uint8Array[], cabecalhos: Record<string, string> = {}, status = 200) {
  return new Response(
    new ReadableStream({
      start(c) {
        for (const p of pedacos) c.enqueue(p);
        c.close();
      },
    }),
    { status, headers: cabecalhos },
  );
}

describe("baixarArquivo", () => {
  it("baixa, mede e calcula o sha256", async () => {
    const r = await baixarArquivo("https://x/1", {
      fetchImpl: async () =>
        respostaFalsa([PDF], { "content-disposition": 'attachment; filename="a.pdf"' }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tamanho).toBe(PDF.length);
    expect(r.tipo.mime).toBe("application/pdf");
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("aborta pelo content-length antes de ler o corpo", async () => {
    let leu = false;
    const r = await baixarArquivo("https://x/1", {
      maxBytes: 100,
      fetchImpl: async () => {
        const resp = respostaFalsa([new Uint8Array(500)], { "content-length": "500" });
        Object.defineProperty(resp, "body", {
          get() {
            leu = true;
            return null;
          },
        });
        return resp;
      },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("grande_demais");
    expect(leu).toBe(false);
  });

  it("aborta durante o corpo quando não há content-length", async () => {
    const pedaco = new Uint8Array(60);
    const r = await baixarArquivo("https://x/1", {
      maxBytes: 100,
      fetchImpl: async () => respostaFalsa([pedaco, pedaco, pedaco]),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("grande_demais");
  });

  it("trata HTTP de erro sem lançar", async () => {
    const r = await baixarArquivo("https://x/1", {
      fetchImpl: async () => respostaFalsa([], {}, 404),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("http");
    expect(r.detalhe).toContain("404");
  });

  it("corpo vazio é falha explícita, não sucesso silencioso", async () => {
    const r = await baixarArquivo("https://x/1", {
      fetchImpl: async () => respostaFalsa([new Uint8Array(0)]),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("vazio");
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run src/services/documentos/download.test.ts`
Expected: FAIL — `Failed to resolve import "./download.server"`.

- [ ] **Step 4: Implementar**

Criar `src/services/documentos/download.server.ts`:

```ts
/**
 * Download de um arquivo do PNCP, com teto de bytes.
 *
 * O teto fecha o critério R04 do arquivo 05. Ele não é teórico: medido em
 * 18/09/2026, dois documentos sorteados vieram com 392 KB (0,85 s) e 10,9 MB
 * (15,2 s). Sem teto, um único anexo consome o tick inteiro e a fila para.
 *
 * O corte acontece em dois lugares porque o PNCP nem sempre manda
 * `content-length`: antes de tocar no corpo quando o cabeçalho existe, e
 * durante a leitura quando não existe.
 */
import { createHash } from "node:crypto";
import { detectarTipo, type TipoArquivo } from "./tipo";

export const MAX_BYTES_PADRAO = 26_214_400; // 25 MB

export class ArquivoGrandeDemais extends Error {
  constructor(readonly tamanho: number) {
    super(`arquivo excede o teto de bytes (${tamanho})`);
    this.name = "ArquivoGrandeDemais";
  }
}

export interface OpcoesDownload {
  maxBytes?: number;
  fetchImpl?: typeof fetch;
  nomeCatalogado?: string | null;
}

export type ResultadoDownload =
  | { ok: true; bytes: Uint8Array; sha256: string; tipo: TipoArquivo; tamanho: number }
  | { ok: false; motivo: "grande_demais" | "http" | "vazio"; detalhe: string; tamanho?: number };

export async function baixarArquivo(
  url: string,
  opcoes: OpcoesDownload = {},
): Promise<ResultadoDownload> {
  const maxBytes = opcoes.maxBytes ?? MAX_BYTES_PADRAO;
  const buscar = opcoes.fetchImpl ?? fetch;

  const resposta = await buscar(url, { redirect: "follow" });

  if (!resposta.ok) {
    return { ok: false, motivo: "http", detalhe: `HTTP ${resposta.status}` };
  }

  const declarado = Number(resposta.headers.get("content-length") ?? "");
  if (Number.isFinite(declarado) && declarado > maxBytes) {
    // Não ler o corpo: o ponto do teto é não gastar a rede.
    return {
      ok: false,
      motivo: "grande_demais",
      detalhe: `content-length ${declarado} > ${maxBytes}`,
      tamanho: declarado,
    };
  }

  const corpo = resposta.body;
  const pedacos: Uint8Array[] = [];
  let total = 0;

  if (corpo) {
    const leitor = corpo.getReader();
    while (true) {
      const { done, value } = await leitor.read();
      if (done) break;
      if (!value) continue;
      total += value.length;
      if (total > maxBytes) {
        await leitor.cancel();
        return {
          ok: false,
          motivo: "grande_demais",
          detalhe: `corpo passou de ${maxBytes} bytes`,
          tamanho: total,
        };
      }
      pedacos.push(value);
    }
  }

  if (total === 0) {
    return { ok: false, motivo: "vazio", detalhe: "corpo sem bytes" };
  }

  const bytes = new Uint8Array(total);
  let posicao = 0;
  for (const p of pedacos) {
    bytes.set(p, posicao);
    posicao += p.length;
  }

  return {
    ok: true,
    bytes,
    tamanho: total,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    tipo: detectarTipo({
      contentDisposition: resposta.headers.get("content-disposition"),
      primeirosBytes: bytes.subarray(0, 8),
      nomeCatalogado: opcoes.nomeCatalogado ?? null,
    }),
  };
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run src/services/documentos/download.test.ts`
Expected: PASS, 5 testes.

- [ ] **Step 6: Commit**

```bash
git add src/services/documentos/download.server.ts src/services/documentos/download.test.ts package.json package-lock.json
git commit -m "feat(documentos): baixar arquivo com teto de bytes (R04)"
```

---

## Task 4: Extração de texto e decisão sem_texto

**Files:**
- Create: `src/services/documentos/texto.ts`
- Test: `src/services/documentos/texto.test.ts`

**Interfaces:**
- Consumes: `unpdf`.
- Produces: `extrairTextoPdf(bytes: Uint8Array): Promise<TextoExtraido>` e `avaliarDensidade(chars: number, paginas: number): "extraido" | "sem_texto"`, com
  `interface TextoExtraido { texto: string; paginas: number; chars: number; densidade: number; estado: "extraido" | "sem_texto" }`.
- Constante exportada `DENSIDADE_MINIMA = 200`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/services/documentos/texto.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { avaliarDensidade, DENSIDADE_MINIMA, normalizarTexto } from "./texto";

describe("avaliarDensidade", () => {
  it("densidade alta é texto de verdade", () => {
    expect(avaliarDensidade(103_602, 38)).toBe("extraido"); // medição real: 2726 chars/pág
  });

  it("densidade baixa é PDF escaneado", () => {
    expect(avaliarDensidade(500, 40)).toBe("sem_texto"); // 12 chars/pág
  });

  it("zero páginas não divide por zero", () => {
    expect(avaliarDensidade(1000, 0)).toBe("sem_texto");
  });

  it("o limiar é exatamente 200 e é inclusivo para cima", () => {
    expect(avaliarDensidade(DENSIDADE_MINIMA * 10, 10)).toBe("extraido");
    expect(avaliarDensidade(DENSIDADE_MINIMA * 10 - 1, 10)).toBe("sem_texto");
  });
});

describe("normalizarTexto", () => {
  it("colapsa espaço em branco sem comer acento", () => {
    expect(normalizarTexto("  PREGÃO   ELETRÔNICO \n\n Nº 1 ")).toBe("PREGÃO ELETRÔNICO Nº 1");
  });

  it("remove o caractere nulo, que o Postgres recusa em text", () => {
    expect(normalizarTexto("ab")).toBe("ab");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/services/documentos/texto.test.ts`
Expected: FAIL — `Failed to resolve import "./texto"`.

- [ ] **Step 3: Implementar**

Criar `src/services/documentos/texto.ts`:

```ts
/**
 * Texto de um PDF do PNCP.
 *
 * Medido em 18/09/2026 sobre dois editais reais: 2.726 e 1.300 chars por
 * página, extraídos em 684 ms e 1.581 ms. Extrair é barato perto de baixar.
 *
 * PDF escaneado não tem camada de texto e produziria chunks vazios que sujam
 * o vetorial sem acrescentar nada. A densidade é o sinal: abaixo de 200
 * chars/página o arquivo é marcado `sem_texto` e não entra na fila de
 * embedding. A v1 não faz OCR — a decisão está na spec, §9.
 */
export const DENSIDADE_MINIMA = 200;

export interface TextoExtraido {
  texto: string;
  paginas: number;
  chars: number;
  densidade: number;
  estado: "extraido" | "sem_texto";
}

export function normalizarTexto(bruto: string): string {
  // O Postgres recusa o caractere nulo (0x00) em colunas text, e PDFs trazem isso.
  return bruto.replace(//g, "").replace(/\s+/g, " ").trim();
}

export function avaliarDensidade(chars: number, paginas: number): "extraido" | "sem_texto" {
  if (paginas <= 0) return "sem_texto";
  return chars / paginas >= DENSIDADE_MINIMA ? "extraido" : "sem_texto";
}

export async function extrairTextoPdf(bytes: Uint8Array): Promise<TextoExtraido> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  const texto = normalizarTexto(Array.isArray(text) ? text.join(" ") : text);
  const paginas = totalPages ?? 0;
  return {
    texto,
    paginas,
    chars: texto.length,
    densidade: paginas > 0 ? texto.length / paginas : 0,
    estado: avaliarDensidade(texto.length, paginas),
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/services/documentos/texto.test.ts`
Expected: PASS, 6 testes.

- [ ] **Step 5: Commit**

```bash
git add src/services/documentos/texto.ts src/services/documentos/texto.test.ts
git commit -m "feat(documentos): extrair texto de PDF e marcar escaneado como sem_texto"
```

---

## Task 5: Worker da fila de arquivos

**Files:**
- Create: `src/services/documentos/worker.arquivos.server.ts`
- Test: `src/services/documentos/worker.arquivos.test.ts`

**Interfaces:**
- Consumes: `baixarArquivo`, `ResultadoDownload` de `./download.server`; `extrairTextoPdf`, `TextoExtraido` de `./texto`.
- Produces:
```ts
interface ArquivoReservado { documentoId: string; licitacaoId: string; url: string; nome: string; tipoDocumento: string }
interface GravacaoArquivo { documentoId: string; estado: "extraido" | "sem_texto" | "grande_demais" | "erro";
  nomeArquivo?: string | null; extensao?: string | null; mime?: string | null; bytes?: number | null;
  sha256?: string | null; paginas?: number | null; chars?: number | null; texto?: string | null; erro?: string | null }
interface PortaArquivos { reservar(limite: number): Promise<ArquivoReservado[]>; gravar(g: GravacaoArquivo): Promise<void> }
interface ResumoTickArquivos { processados: number; extraidos: number; semTexto: number; grandesDemais: number; erros: string[]; filaVazia: boolean; duracaoMs: number }
executarTickArquivos(opcoes: OpcoesTickArquivos): Promise<ResumoTickArquivos>
```

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/services/documentos/worker.arquivos.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { executarTickArquivos, type GravacaoArquivo, type PortaArquivos } from "./worker.arquivos.server";

function bancoFalso(fila: Array<{ documentoId: string; licitacaoId: string; url: string; nome: string; tipoDocumento: string }>) {
  const gravado: GravacaoArquivo[] = [];
  const banco: PortaArquivos = {
    async reservar(limite) {
      return fila.splice(0, limite);
    },
    async gravar(g) {
      gravado.push(g);
    },
  };
  return { banco, gravado };
}

const item = (id: string) => ({
  documentoId: id,
  licitacaoId: `lic-${id}`,
  url: `https://pncp/${id}`,
  nome: `doc ${id}`,
  tipoDocumento: "edital",
});

describe("executarTickArquivos", () => {
  it("grava texto extraído quando o download e a extração dão certo", async () => {
    const { banco, gravado } = bancoFalso([item("1")]);
    const resumo = await executarTickArquivos({
      banco,
      intervaloPartidaMs: 0,
      baixar: async () => ({
        ok: true,
        bytes: new Uint8Array([1]),
        sha256: "abc",
        tamanho: 1,
        tipo: { nomeArquivo: "a.pdf", extensao: "pdf", mime: "application/pdf", suportado: true },
      }),
      extrair: async () => ({ texto: "objeto do edital", paginas: 2, chars: 800, densidade: 400, estado: "extraido" }),
    });
    expect(resumo.extraidos).toBe(1);
    expect(gravado[0]!.estado).toBe("extraido");
    expect(gravado[0]!.texto).toBe("objeto do edital");
    expect(gravado[0]!.sha256).toBe("abc");
  });

  it("arquivo acima do teto vira grande_demais e não tenta extrair", async () => {
    const { banco, gravado } = bancoFalso([item("1")]);
    let extraiu = false;
    const resumo = await executarTickArquivos({
      banco,
      intervaloPartidaMs: 0,
      baixar: async () => ({ ok: false, motivo: "grande_demais", detalhe: "grande", tamanho: 99 }),
      extrair: async () => {
        extraiu = true;
        throw new Error("não deveria extrair");
      },
    });
    expect(extraiu).toBe(false);
    expect(resumo.grandesDemais).toBe(1);
    expect(gravado[0]!.estado).toBe("grande_demais");
  });

  it("formato não suportado é registrado como erro visível, não ignorado", async () => {
    const { banco, gravado } = bancoFalso([item("1")]);
    await executarTickArquivos({
      banco,
      intervaloPartidaMs: 0,
      baixar: async () => ({
        ok: true,
        bytes: new Uint8Array([1]),
        sha256: "abc",
        tamanho: 1,
        tipo: { nomeArquivo: "a.zip", extensao: "zip", mime: "application/zip", suportado: false },
      }),
      extrair: async () => {
        throw new Error("não deveria extrair");
      },
    });
    expect(gravado[0]!.estado).toBe("erro");
    expect(gravado[0]!.erro).toContain("formato_nao_suportado");
  });

  it("um arquivo problemático não derruba o lote", async () => {
    const { banco, gravado } = bancoFalso([item("1"), item("2")]);
    const resumo = await executarTickArquivos({
      banco,
      intervaloPartidaMs: 0,
      concorrencia: 1,
      baixar: async (url) => {
        if (url.endsWith("1")) throw new Error("rede caiu");
        return {
          ok: true,
          bytes: new Uint8Array([1]),
          sha256: "abc",
          tamanho: 1,
          tipo: { nomeArquivo: "a.pdf", extensao: "pdf", mime: "application/pdf", suportado: true },
        };
      },
      extrair: async () => ({ texto: "t", paginas: 1, chars: 300, densidade: 300, estado: "extraido" }),
    });
    expect(resumo.processados).toBe(2);
    expect(resumo.extraidos).toBe(1);
    expect(resumo.erros).toHaveLength(1);
  });

  it("PDF escaneado vira sem_texto e não guarda texto vazio", async () => {
    const { banco, gravado } = bancoFalso([item("1")]);
    const resumo = await executarTickArquivos({
      banco,
      intervaloPartidaMs: 0,
      baixar: async () => ({
        ok: true,
        bytes: new Uint8Array([1]),
        sha256: "abc",
        tamanho: 1,
        tipo: { nomeArquivo: "a.pdf", extensao: "pdf", mime: "application/pdf", suportado: true },
      }),
      extrair: async () => ({ texto: "x", paginas: 40, chars: 1, densidade: 0.025, estado: "sem_texto" }),
    });
    expect(resumo.semTexto).toBe(1);
    expect(gravado[0]!.estado).toBe("sem_texto");
    expect(gravado[0]!.texto).toBeNull();
  });

  it("reserva vazia encerra o tick sinalizando fila vazia", async () => {
    const { banco } = bancoFalso([]);
    const resumo = await executarTickArquivos({ banco, intervaloPartidaMs: 0 });
    expect(resumo.filaVazia).toBe(true);
    expect(resumo.processados).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/services/documentos/worker.arquivos.test.ts`
Expected: FAIL — `Failed to resolve import "./worker.arquivos.server"`.

- [ ] **Step 3: Implementar**

Criar `src/services/documentos/worker.arquivos.server.ts`:

```ts
/**
 * WORKER DA FILA DE ARQUIVOS.
 *
 * Terceira fila do sistema, irmã da fila de documentos: descobrir oportunidade,
 * catalogar anexo e baixar anexo são ritmos diferentes e não podem se prender.
 *
 * Invariantes herdadas do worker de documentos:
 * - a rede acontece FORA da transação; o commit é a RPC `gravar_arquivo`;
 * - falha antes do commit deixa o arquivo reservado, e o lease expira sozinho;
 * - um arquivo problemático não derruba o lote;
 * - estado definitivo (grande demais, formato não suportado) não volta à fila.
 *
 * Pressão sobre a fonte: 2 simultâneas e 2 partidas por segundo para toda a
 * integração (arquivo 03 §8). Download é muito mais pesado que metadado — um
 * arquivo medido levou 15,2 s —, então a concorrência fica em 2 e o worker de
 * arquivos não roda junto com o de cabeçalhos.
 */
import { baixarArquivo, type ResultadoDownload } from "./download.server";
import { extrairTextoPdf, type TextoExtraido } from "./texto";

export interface ArquivoReservado {
  documentoId: string;
  licitacaoId: string;
  url: string;
  nome: string;
  tipoDocumento: string;
}

export interface GravacaoArquivo {
  documentoId: string;
  estado: "extraido" | "sem_texto" | "grande_demais" | "erro";
  nomeArquivo?: string | null;
  extensao?: string | null;
  mime?: string | null;
  bytes?: number | null;
  sha256?: string | null;
  paginas?: number | null;
  chars?: number | null;
  texto?: string | null;
  erro?: string | null;
}

export interface PortaArquivos {
  reservar(limite: number): Promise<ArquivoReservado[]>;
  gravar(gravacao: GravacaoArquivo): Promise<void>;
}

export interface OpcoesTickArquivos {
  banco: PortaArquivos;
  baixar?: (url: string, opcoes?: { maxBytes?: number; nomeCatalogado?: string | null }) => Promise<ResultadoDownload>;
  extrair?: (bytes: Uint8Array) => Promise<TextoExtraido>;
  agora?: () => number;
  dormir?: (ms: number) => Promise<void>;
  orcamentoMs?: number;
  reservaMs?: number;
  loteReserva?: number;
  maxArquivosPorTick?: number;
  concorrencia?: number;
  intervaloPartidaMs?: number;
  maxBytes?: number;
}

export interface ResumoTickArquivos {
  processados: number;
  extraidos: number;
  semTexto: number;
  grandesDemais: number;
  erros: string[];
  filaVazia: boolean;
  duracaoMs: number;
}

const PADRAO = {
  // Um download medido levou 15,2 s. O orçamento é maior que o da fila de
  // metadados porque aqui cada item pode ser lento por natureza.
  orcamentoMs: 120_000,
  reservaMs: 20_000,
  loteReserva: 10,
  maxArquivosPorTick: 100,
  concorrencia: 2,
  intervaloPartidaMs: 500,
  maxBytes: Number(process.env["DOCS_MAX_BYTES"] ?? 26_214_400),
};

const dormirPadrao = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function executarTickArquivos(
  opcoes: OpcoesTickArquivos,
): Promise<ResumoTickArquivos> {
  const cfg = { ...PADRAO, ...opcoes };
  const baixar = opcoes.baixar ?? baixarArquivo;
  const extrair = opcoes.extrair ?? extrairTextoPdf;
  const agora = opcoes.agora ?? Date.now;
  const dormir = opcoes.dormir ?? dormirPadrao;

  const inicio = agora();
  const resumo: ResumoTickArquivos = {
    processados: 0,
    extraidos: 0,
    semTexto: 0,
    grandesDemais: 0,
    erros: [],
    filaVazia: false,
    duracaoMs: 0,
  };

  const reservados = await cfg.banco.reservar(Math.min(cfg.loteReserva, cfg.maxArquivosPorTick));
  if (reservados.length === 0) {
    resumo.filaVazia = true;
    resumo.duracaoMs = agora() - inicio;
    return resumo;
  }

  let proximaPartida = 0;

  async function processar(item: ArquivoReservado): Promise<void> {
    try {
      const download = await baixar(item.url, {
        maxBytes: cfg.maxBytes,
        nomeCatalogado: item.nome,
      });

      if (!download.ok) {
        if (download.motivo === "grande_demais") {
          resumo.grandesDemais++;
          await cfg.banco.gravar({
            documentoId: item.documentoId,
            estado: "grande_demais",
            bytes: download.tamanho ?? null,
            erro: download.detalhe,
          });
          return;
        }
        resumo.erros.push(`${item.documentoId}: ${download.detalhe}`);
        await cfg.banco.gravar({
          documentoId: item.documentoId,
          estado: "erro",
          erro: `${download.motivo}: ${download.detalhe}`,
        });
        return;
      }

      if (!download.tipo.suportado) {
        // Visível e contabilizado: a v1 só lê PDF, e saber quanto do acervo é
        // ZIP/DOC é o que vai decidir se vale ampliar.
        resumo.erros.push(`${item.documentoId}: formato_nao_suportado ${download.tipo.mime ?? "?"}`);
        await cfg.banco.gravar({
          documentoId: item.documentoId,
          estado: "erro",
          nomeArquivo: download.tipo.nomeArquivo,
          extensao: download.tipo.extensao,
          mime: download.tipo.mime,
          bytes: download.tamanho,
          sha256: download.sha256,
          erro: `formato_nao_suportado: ${download.tipo.mime ?? "desconhecido"}`,
        });
        return;
      }

      const extraido = await extrair(download.bytes);
      if (extraido.estado === "sem_texto") resumo.semTexto++;
      else resumo.extraidos++;

      await cfg.banco.gravar({
        documentoId: item.documentoId,
        estado: extraido.estado,
        nomeArquivo: download.tipo.nomeArquivo,
        extensao: download.tipo.extensao,
        mime: download.tipo.mime,
        bytes: download.tamanho,
        sha256: download.sha256,
        paginas: extraido.paginas,
        chars: extraido.chars,
        // Texto de PDF escaneado é ruído: não guardar.
        texto: extraido.estado === "extraido" ? extraido.texto : null,
        erro: null,
      });
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      resumo.erros.push(`${item.documentoId}: ${motivo}`);
      await cfg.banco.gravar({ documentoId: item.documentoId, estado: "erro", erro: motivo });
    } finally {
      resumo.processados++;
    }
  }

  const pendentes = [...reservados];
  async function trabalhador(): Promise<void> {
    while (pendentes.length > 0) {
      if (agora() - inicio > cfg.orcamentoMs - cfg.reservaMs) return;
      const item = pendentes.shift();
      if (!item) return;
      const espera = proximaPartida - agora();
      // A vaga de partida é reservada ANTES de qualquer await. Atualizar
      // `proximaPartida` depois do `dormir` abriria uma janela em que o outro
      // trabalhador lê o valor velho, dorme o mesmo tanto e dispara junto —
      // duas partidas no mesmo instante, furando o limite do arquivo 03 §8.
      proximaPartida = Math.max(proximaPartida, agora()) + cfg.intervaloPartidaMs;
      if (espera > 0) await dormir(espera);
      await processar(item);
    }
  }

  await Promise.all(Array.from({ length: cfg.concorrencia }, () => trabalhador()));

  resumo.duracaoMs = agora() - inicio;
  return resumo;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/services/documentos/worker.arquivos.test.ts`
Expected: PASS, 6 testes.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS — nenhum teste existente quebrado.

- [ ] **Step 6: Commit**

```bash
git add src/services/documentos/worker.arquivos.server.ts src/services/documentos/worker.arquivos.test.ts
git commit -m "feat(documentos): worker retomavel da fila de arquivos"
```

---

## Task 6: Porta Supabase e CLI da fila de arquivos

**Files:**
- Create: `src/services/documentos/repositorio.arquivos.server.ts`
- Create: `scripts/baixar-documentos.ts`
- Modify: `package.json` (script `baixar:documentos`)

**Interfaces:**
- Consumes: `PortaArquivos`, `ArquivoReservado`, `GravacaoArquivo`, `executarTickArquivos` da Task 5.
- Produces: `portaArquivosSupabase(): PortaArquivos` e `coberturaArquivos(): Promise<Record<string, number>>`.

- [ ] **Step 1: Implementar a porta**

Criar `src/services/documentos/repositorio.arquivos.server.ts`. Seguir o padrão de `src/services/pncp/repositorio.server.ts`: cliente criado sob demanda, `.rpc()` com os nomes exatos da Task 1.

```ts
/**
 * Porta Supabase da fila de arquivos.
 *
 * A reserva e o commit são RPCs `security definer` (Task 1): a chave de serviço
 * fica no servidor e a política de posse mora no banco, não aqui.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ArquivoReservado, GravacaoArquivo, PortaArquivos } from "./worker.arquivos.server";

let cliente: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (cliente) return cliente;
  const url = process.env["SUPABASE_URL"];
  const chave = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !chave) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios");
  cliente = createClient(url, chave, { auth: { persistSession: false } });
  return cliente;
}

export function portaArquivosSupabase(): PortaArquivos {
  return {
    async reservar(limite: number): Promise<ArquivoReservado[]> {
      const { data, error } = await db().rpc("reservar_arquivos", { p_limite: limite });
      if (error) throw new Error(`reservar_arquivos: ${error.message}`);
      return (data ?? []).map((linha: Record<string, unknown>) => ({
        documentoId: String(linha["documento_id"]),
        licitacaoId: String(linha["licitacao_id"]),
        url: String(linha["url"]),
        nome: String(linha["nome"] ?? ""),
        tipoDocumento: String(linha["tipo_documento"] ?? "outro"),
      }));
    },

    async gravar(g: GravacaoArquivo): Promise<void> {
      const { error } = await db().rpc("gravar_arquivo", {
        p_documento_id: g.documentoId,
        p_estado: g.estado,
        p_nome_arquivo: g.nomeArquivo ?? null,
        p_extensao: g.extensao ?? null,
        p_mime: g.mime ?? null,
        p_bytes: g.bytes ?? null,
        p_sha256: g.sha256 ?? null,
        p_paginas: g.paginas ?? null,
        p_chars: g.chars ?? null,
        p_texto: g.texto ?? null,
        p_erro: g.erro ?? null,
      });
      if (error) throw new Error(`gravar_arquivo: ${error.message}`);
    },
  };
}

export async function coberturaArquivos(): Promise<Record<string, number>> {
  const contar = async (filtro: string) => {
    const { count, error } = await db()
      .from("documentos_arquivo")
      .select("documento_id", { count: "exact", head: true })
      .eq("estado", filtro);
    if (error) throw new Error(`cobertura ${filtro}: ${error.message}`);
    return count ?? 0;
  };
  const { count: total, error } = await db()
    .from("documentos_licitacao")
    .select("id", { count: "exact", head: true })
    .not("url", "is", null);
  if (error) throw new Error(`cobertura total: ${error.message}`);
  return {
    total: total ?? 0,
    extraido: await contar("extraido"),
    sem_texto: await contar("sem_texto"),
    grande_demais: await contar("grande_demais"),
    erro: await contar("erro"),
  };
}
```

- [ ] **Step 2: Implementar o CLI**

Criar `scripts/baixar-documentos.ts`, no molde de `scripts/coletar-documentos.ts`:

```ts
/**
 * Esvazia a fila de arquivos: baixa o PDF de cada documento catalogado e
 * guarda o texto extraído.
 *
 *   npm run baixar:documentos
 *   npm run baixar:documentos -- 50     (para só 50 arquivos)
 *
 * Retomável: cada tick deixa a fila consistente, e Ctrl+C não perde o que já
 * foi gravado. Arquivo acima do teto e formato não suportado são estados
 * definitivos — não voltam para a fila.
 */
import { readFileSync } from "node:fs";

function carregarEnv() {
  const texto = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const linha of texto.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
    const chave = m?.[1];
    const valor = m?.[2];
    if (chave && valor !== undefined) process.env[chave] = valor.replace(/^["']|["']$/g, "");
  }
}

const numeroBR = (n: number) => n.toLocaleString("pt-BR");

async function main() {
  carregarEnv();

  const limiteArg = Number(process.argv[2]);
  const limiteTotal = Number.isInteger(limiteArg) && limiteArg > 0 ? limiteArg : Infinity;

  const repo = await import("../src/services/documentos/repositorio.arquivos.server");
  const { executarTickArquivos } = await import("../src/services/documentos/worker.arquivos.server");

  const antes = await repo.coberturaArquivos();
  const prontos = antes["extraido"]! + antes["sem_texto"]! + antes["grande_demais"]! + antes["erro"]!;
  const faltam = antes["total"]! - prontos;

  console.log(`Fila: ${numeroBR(faltam)} arquivos a baixar (${numeroBR(prontos)} de ${numeroBR(antes["total"]!)} já processados).`);
  if (faltam <= 0) {
    console.log("Nada a fazer.");
    return;
  }
  console.log(`Estimativa: ~${Math.ceil(Math.min(faltam, limiteTotal) / 2 / 60)} min no limite de 2 partidas/s.\n`);

  const banco = repo.portaArquivosSupabase();
  const inicio = Date.now();
  let processados = 0;

  while (processados < limiteTotal) {
    const resumo = await executarTickArquivos({ banco });
    if (resumo.filaVazia) {
      console.log("Fila vazia.");
      break;
    }
    processados += resumo.processados;
    console.log(
      `+${resumo.processados} (texto ${resumo.extraidos}, sem texto ${resumo.semTexto}, ` +
        `grandes ${resumo.grandesDemais}, erros ${resumo.erros.length}) — ${numeroBR(processados)} no total`,
    );
    for (const e of resumo.erros.slice(0, 3)) console.log(`   ! ${e}`);
  }

  const depois = await repo.coberturaArquivos();
  console.log(
    `\nConcluído em ${Math.round((Date.now() - inicio) / 1000)}s. ` +
      `Com texto: ${numeroBR(depois["extraido"]!)}, sem texto: ${numeroBR(depois["sem_texto"]!)}, ` +
      `grandes demais: ${numeroBR(depois["grande_demais"]!)}, erros: ${numeroBR(depois["erro"]!)}.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: Registrar o script**

Em `package.json`, dentro de `"scripts"`:

```json
"baixar:documentos": "tsx scripts/baixar-documentos.ts"
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros nos arquivos novos.

- [ ] **Step 5: Exercitar contra o banco, se o esquema já estiver aplicado**

Run: `npm run verificar:busca`
- Se passar: `npm run baixar:documentos -- 5` e conferir que 5 linhas saíram de `pendente`.
- Se falhar (404): **não é erro desta tarefa.** Registrar no relatório que o esquema da Task 1 ainda não foi colado no SQL Editor, e seguir.

- [ ] **Step 6: Commit**

```bash
git add src/services/documentos/repositorio.arquivos.server.ts scripts/baixar-documentos.ts package.json
git commit -m "feat(documentos): porta supabase e CLI da fila de arquivos"
```

---

## Task 7: Interface Embedder e implementação Ollama

**Files:**
- Create: `src/services/busca/embedder.ts`
- Test: `src/services/busca/embedder.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
```ts
interface Embedder { readonly modelo: string; readonly versao: string; readonly dimensoes: number;
  embed(textos: string[]): Promise<Float32Array[]> }
class OllamaEmbedder implements Embedder
class EmbedderFalso implements Embedder   // exportado para os testes das tasks 9 e 12
class ErroDimensao extends Error
function paraLiteralPg(v: Float32Array): string   // "[0.1,0.2,...]"
const DIMENSOES = 1024
const MODELO_PADRAO = "bge-m3"
```

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/services/busca/embedder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DIMENSOES, EmbedderFalso, ErroDimensao, OllamaEmbedder, paraLiteralPg } from "./embedder";

function respostaJson(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

const vetor = (n: number) => Array.from({ length: n }, (_, i) => i / n);

describe("OllamaEmbedder", () => {
  it("manda o lote inteiro numa requisição só", async () => {
    let corpoEnviado: unknown = null;
    const e = new OllamaEmbedder({
      fetchImpl: async (_url, init) => {
        corpoEnviado = JSON.parse(String((init as RequestInit).body));
        return respostaJson({ embeddings: [vetor(DIMENSOES), vetor(DIMENSOES)] });
      },
    });
    const r = await e.embed(["a", "b"]);
    expect(r).toHaveLength(2);
    expect(r[0]).toBeInstanceOf(Float32Array);
    expect((corpoEnviado as { input: string[] }).input).toEqual(["a", "b"]);
  });

  it("recusa vetor com dimensão diferente da esperada", async () => {
    const e = new OllamaEmbedder({
      fetchImpl: async () => respostaJson({ embeddings: [vetor(384)] }),
    });
    await expect(e.embed(["a"])).rejects.toBeInstanceOf(ErroDimensao);
  });

  it("erro HTTP vira exceção com o status", async () => {
    const e = new OllamaEmbedder({ fetchImpl: async () => respostaJson({ error: "x" }, 500) });
    await expect(e.embed(["a"])).rejects.toThrow(/500/);
  });

  it("lote vazio não faz requisição", async () => {
    let chamou = false;
    const e = new OllamaEmbedder({
      fetchImpl: async () => {
        chamou = true;
        return respostaJson({ embeddings: [] });
      },
    });
    expect(await e.embed([])).toEqual([]);
    expect(chamou).toBe(false);
  });
});

describe("paraLiteralPg", () => {
  it("serializa no formato que o pgvector aceita", () => {
    expect(paraLiteralPg(new Float32Array([1, 0.5, -0.25]))).toBe("[1,0.5,-0.25]");
  });
});

describe("EmbedderFalso", () => {
  it("é determinístico: mesmo texto, mesmo vetor", async () => {
    const e = new EmbedderFalso();
    const [a] = await e.embed(["reforma de escola"]);
    const [b] = await e.embed(["reforma de escola"]);
    expect(Array.from(a!)).toEqual(Array.from(b!));
    expect(a).toHaveLength(DIMENSOES);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/services/busca/embedder.test.ts`
Expected: FAIL — `Failed to resolve import "./embedder"`.

- [ ] **Step 3: Implementar**

Criar `src/services/busca/embedder.ts`:

```ts
/**
 * Provedor de embeddings.
 *
 * Não existe chave de API neste projeto, e a ADR-001 não autoriza gasto para
 * uma hipótese não medida. O padrão é Ollama local com bge-m3: grátis, offline,
 * multilíngue, e roda onde a rotina noturna já roda.
 *
 * Medido em 18/09/2026: 1024 dimensões; 6,9 s na primeira chamada (carga do
 * modelo em memória) e ~123 ms por texto em lote depois. Por isso o worker
 * sempre manda lote, nunca um texto por requisição.
 *
 * A interface existe para que trocar por uma API hospedada seja configuração, e
 * não reescrita. Modelo e versão viajam com cada vetor gravado — exigência da
 * ADR-001, que proíbe misturar vetores de modelos diferentes.
 */
export const DIMENSOES = 1024;
export const MODELO_PADRAO = "bge-m3";

export interface Embedder {
  readonly modelo: string;
  readonly versao: string;
  readonly dimensoes: number;
  embed(textos: string[]): Promise<Float32Array[]>;
}

export class ErroDimensao extends Error {
  constructor(esperado: number, recebido: number) {
    super(`embedding com ${recebido} dimensões, esperado ${esperado}`);
    this.name = "ErroDimensao";
  }
}

export function paraLiteralPg(vetor: Float32Array): string {
  return `[${Array.from(vetor).join(",")}]`;
}

export interface OpcoesOllama {
  url?: string;
  modelo?: string;
  versao?: string;
  fetchImpl?: typeof fetch;
}

export class OllamaEmbedder implements Embedder {
  readonly modelo: string;
  readonly versao: string;
  readonly dimensoes = DIMENSOES;
  private readonly url: string;
  private readonly buscar: typeof fetch;

  constructor(opcoes: OpcoesOllama = {}) {
    this.modelo = opcoes.modelo ?? process.env["EMBEDDING_MODELO"] ?? MODELO_PADRAO;
    this.versao = opcoes.versao ?? process.env["EMBEDDING_VERSAO"] ?? "ollama";
    this.url = opcoes.url ?? process.env["OLLAMA_URL"] ?? "http://127.0.0.1:11434";
    this.buscar = opcoes.fetchImpl ?? fetch;
  }

  async embed(textos: string[]): Promise<Float32Array[]> {
    if (textos.length === 0) return [];

    const resposta = await this.buscar(`${this.url}/api/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: this.modelo, input: textos }),
    });

    if (!resposta.ok) {
      throw new Error(`Ollama respondeu HTTP ${resposta.status}`);
    }

    const corpo = (await resposta.json()) as { embeddings?: number[][] };
    const vetores = corpo.embeddings ?? [];

    return vetores.map((v) => {
      if (v.length !== this.dimensoes) throw new ErroDimensao(this.dimensoes, v.length);
      return Float32Array.from(v);
    });
  }
}

/**
 * Embedder determinístico para teste: mesmo texto, mesmo vetor, sem rede.
 * Não tem significado semântico e não serve para medir relevância.
 */
export class EmbedderFalso implements Embedder {
  readonly modelo = "falso";
  readonly versao = "1";
  readonly dimensoes = DIMENSOES;

  async embed(textos: string[]): Promise<Float32Array[]> {
    return textos.map((texto) => {
      const v = new Float32Array(this.dimensoes);
      let semente = 0;
      for (let i = 0; i < texto.length; i++) semente = (semente * 31 + texto.charCodeAt(i)) % 2147483647;
      for (let i = 0; i < this.dimensoes; i++) {
        semente = (semente * 1103515245 + 12345) % 2147483647;
        v[i] = semente / 2147483647;
      }
      return v;
    });
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/services/busca/embedder.test.ts`
Expected: PASS, 6 testes.

- [ ] **Step 5: Confirmar contra o Ollama de verdade**

Run:
```bash
curl -s http://127.0.0.1:11434/api/embed -d '{"model":"bge-m3","input":"teste"}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log('dimensoes:',JSON.parse(s).embeddings[0].length))"
```
Expected: `dimensoes: 1024`. Se o Ollama não estiver rodando, subir com `ollama serve` e `ollama pull bge-m3`. Registrar no relatório se não for possível.

- [ ] **Step 6: Commit**

```bash
git add src/services/busca/embedder.ts src/services/busca/embedder.test.ts
git commit -m "feat(busca): interface Embedder com implementacao Ollama"
```

---

## Task 8: Divisão de texto em chunks

**Files:**
- Create: `src/services/busca/chunk.ts`
- Test: `src/services/busca/chunk.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `dividirEmChunks(texto: string, opcoes?: OpcoesChunk): string[]` com
  `interface OpcoesChunk { tamanho?: number; sobreposicao?: number; maxChunks?: number }`,
  e as constantes `TAMANHO_CHUNK = 1500`, `SOBREPOSICAO = 200`, `MAX_CHUNKS_DOC = 40`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/services/busca/chunk.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dividirEmChunks, MAX_CHUNKS_DOC, SOBREPOSICAO, TAMANHO_CHUNK } from "./chunk";

const texto = (n: number) => "a".repeat(n);

describe("dividirEmChunks", () => {
  it("texto menor que o chunk vira um chunk só", () => {
    expect(dividirEmChunks("edital curto")).toEqual(["edital curto"]);
  });

  it("texto vazio não vira chunk nenhum", () => {
    expect(dividirEmChunks("   ")).toEqual([]);
  });

  it("respeita tamanho e sobreposição", () => {
    const chunks = dividirEmChunks(texto(3000), { tamanho: 1000, sobreposicao: 200 });
    expect(chunks[0]).toHaveLength(1000);
    // O segundo começa 800 chars adiante: 1000 - 200 de sobreposição.
    expect(chunks.length).toBe(Math.ceil((3000 - 200) / 800));
  });

  it("corta no limite de palavra quando há espaço perto do fim", () => {
    const frase = "pavimentacao asfaltica de vias urbanas no municipio de Lins ".repeat(60);
    const chunks = dividirEmChunks(frase, { tamanho: 100, sobreposicao: 10 });
    for (const c of chunks.slice(0, -1)) {
      expect(c.endsWith(" ")).toBe(false);
      expect(c.trim()).toBe(c);
    }
  });

  it("obedece ao teto de chunks por documento", () => {
    const chunks = dividirEmChunks(texto(500_000), { tamanho: 1000, sobreposicao: 100, maxChunks: 5 });
    expect(chunks).toHaveLength(5);
  });

  it("os padrões são os da spec", () => {
    expect(TAMANHO_CHUNK).toBe(1500);
    expect(SOBREPOSICAO).toBe(200);
    expect(MAX_CHUNKS_DOC).toBe(40);
  });

  it("sobreposição maior que o tamanho não trava em laço infinito", () => {
    const chunks = dividirEmChunks(texto(5000), { tamanho: 100, sobreposicao: 500 });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.length).toBeLessThan(200);
  });

  it("sobreposição dentro da janela de recuo não trava, mesmo com espaços", () => {
    // O fixture PRECISA ter espaço perto de 80% do tamanho: é o recuo por
    // limite de palavra que empurra `inicio` para trás. Um texto só de "a"
    // nunca exercita esse caminho e deixa o laço infinito passar despercebido.
    const comEspaco = "a".repeat(81) + " " + "b".repeat(5000);
    const chunks = dividirEmChunks(comEspaco, { tamanho: 100, sobreposicao: 90 });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.length).toBeLessThanOrEqual(40);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/services/busca/chunk.test.ts`
Expected: FAIL — `Failed to resolve import "./chunk"`.

- [ ] **Step 3: Implementar**

Criar `src/services/busca/chunk.ts`:

```ts
/**
 * Divisão do texto de um edital em trechos vetorizáveis.
 *
 * Sobreposição existe porque a informação que responde à busca costuma cair na
 * emenda: um trecho termina no meio da descrição do objeto e o seguinte começa
 * depois dela. 200 chars de sobreposição custam pouco e evitam esse buraco.
 *
 * O teto por documento é controle de tamanho de banco, não de qualidade: um
 * edital medido tinha 103 mil chars, o que daria ~70 trechos. Os 40 primeiros
 * cobrem objeto, dotação e habilitação, que é onde a intenção de busca mora.
 * Revisar com medição de onde os acertos realmente caem.
 */
export const TAMANHO_CHUNK = 1500;
export const SOBREPOSICAO = 200;
export const MAX_CHUNKS_DOC = 40;

export interface OpcoesChunk {
  tamanho?: number;
  sobreposicao?: number;
  maxChunks?: number;
}

export function dividirEmChunks(texto: string, opcoes: OpcoesChunk = {}): string[] {
  const tamanho = opcoes.tamanho ?? TAMANHO_CHUNK;
  const maxChunks = opcoes.maxChunks ?? MAX_CHUNKS_DOC;
  // Sobreposição ≥ tamanho faria o cursor andar para trás e o laço nunca
  // terminar. Limitar aqui é mais seguro que confiar em quem chama.
  const sobreposicao = Math.min(opcoes.sobreposicao ?? SOBREPOSICAO, tamanho - 1);

  const limpo = texto.trim();
  if (limpo.length === 0) return [];
  if (limpo.length <= tamanho) return [limpo];

  const chunks: string[] = [];
  let inicio = 0;

  while (inicio < limpo.length && chunks.length < maxChunks) {
    let fim = Math.min(inicio + tamanho, limpo.length);

    if (fim < limpo.length) {
      // Recuar até o último espaço, para não partir palavra no meio. Só recua
      // dentro dos últimos 20% do trecho: mais que isso encolheria demais.
      const espaco = limpo.lastIndexOf(" ", fim);
      if (espaco > inicio + tamanho * 0.8) fim = espaco;
    }

    const trecho = limpo.slice(inicio, fim).trim();
    if (trecho.length > 0) chunks.push(trecho);

    if (fim >= limpo.length) break;
    // Progresso garantido. O recuo por limite de palavra pode puxar `fim` para
    // perto de 80% do tamanho; com sobreposição acima disso, `fim - sobreposicao`
    // andaria para TRÁS, `inicio` ficaria negativo, o slice devolveria string
    // vazia e o laço nunca terminaria — travando o processo, porque ele é
    // síncrono. Medido: com tamanho 100 e sobreposição 90, trava de verdade.
    inicio = Math.max(inicio + 1, fim - sobreposicao);
  }

  return chunks;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/services/busca/chunk.test.ts`
Expected: PASS, 7 testes.

- [ ] **Step 5: Commit**

```bash
git add src/services/busca/chunk.ts src/services/busca/chunk.test.ts
git commit -m "feat(busca): dividir texto de edital em chunks com sobreposicao"
```

---

## Task 9: Fila e worker de embeddings

**Files:**
- Create: `supabase/migrations/20260918155000_fila_embeddings.sql`
- Create: `supabase/APLICAR-FILA-EMBEDDINGS.sql`
- Create: `src/services/busca/worker.embeddings.server.ts`
- Test: `src/services/busca/worker.embeddings.test.ts`

**Interfaces:**
- Consumes: `Embedder`, `EmbedderFalso`, `paraLiteralPg`, `DIMENSOES` de `./embedder`; `dividirEmChunks`, `MAX_CHUNKS_DOC` de `./chunk`.
- Produces:
```ts
interface LicitacaoParaEmbedding { licitacaoId: string; texto: string; origemHash: string }
interface DocumentoParaEmbedding { documentoId: string; licitacaoId: string; texto: string; origemHash: string }
interface PortaEmbeddings {
  reservarLicitacoes(limite: number): Promise<LicitacaoParaEmbedding[]>;
  reservarDocumentos(limite: number): Promise<DocumentoParaEmbedding[]>;
  gravarLicitacao(licitacaoId: string, literal: string, modelo: string, versao: string, origemHash: string): Promise<void>;
  gravarChunks(documentoId: string, licitacaoId: string, chunks: Array<{ ordem: number; texto: string; literal: string }>, modelo: string, versao: string, origemHash: string): Promise<void>;
}
interface ResumoTickEmbeddings { licitacoes: number; documentos: number; chunks: number; erros: string[]; filaVazia: boolean; duracaoMs: number }
executarTickEmbeddings(opcoes: OpcoesTickEmbeddings): Promise<ResumoTickEmbeddings>
```

- [ ] **Step 1: Escrever a migração da fila**

Criar `supabase/migrations/20260918155000_fila_embeddings.sql`:

```sql
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
```

- [ ] **Step 2: Gerar o gêmeo UTF-8**

```bash
node -e "const fs=require('fs');const sql=fs.readFileSync('supabase/migrations/20260918155000_fila_embeddings.sql','utf8');const cab='-- Cole este arquivo inteiro no SQL Editor do projeto sfjesuzvsupjlkzeijzc.\n-- Aplicar DEPOIS de APLICAR-BUSCA-SEMANTICA.sql.\n\n';fs.writeFileSync('supabase/APLICAR-FILA-EMBEDDINGS.sql',cab+sql,{encoding:'utf8'})"
```

- [ ] **Step 3: Escrever o teste que falha**

Criar `src/services/busca/worker.embeddings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EmbedderFalso } from "./embedder";
import {
  executarTickEmbeddings,
  type DocumentoParaEmbedding,
  type LicitacaoParaEmbedding,
  type PortaEmbeddings,
} from "./worker.embeddings.server";

function bancoFalso(
  licitacoes: LicitacaoParaEmbedding[] = [],
  documentos: DocumentoParaEmbedding[] = [],
) {
  const gravadasLic: Array<{ id: string; literal: string; modelo: string }> = [];
  const gravadosChunks: Array<{
    documentoId: string;
    chunks: Array<{ ordem: number; texto: string; literal: string }>;
  }> = [];
  const banco: PortaEmbeddings = {
    async reservarLicitacoes(limite) {
      return licitacoes.splice(0, limite);
    },
    async reservarDocumentos(limite) {
      return documentos.splice(0, limite);
    },
    async gravarLicitacao(licitacaoId, literal, modelo) {
      gravadasLic.push({ id: licitacaoId, literal, modelo });
    },
    async gravarChunks(documentoId, _licitacaoId, chunks) {
      gravadosChunks.push({ documentoId, chunks });
    },
  };
  return { banco, gravadasLic, gravadosChunks };
}

describe("executarTickEmbeddings", () => {
  it("vetoriza licitações e grava no formato literal do pgvector", async () => {
    const { banco, gravadasLic } = bancoFalso([
      { licitacaoId: "l1", texto: "pavimentação asfáltica", origemHash: "h1" },
    ]);
    const resumo = await executarTickEmbeddings({ banco, embedder: new EmbedderFalso() });
    expect(resumo.licitacoes).toBe(1);
    expect(gravadasLic[0]!.literal).toMatch(/^\[/);
    expect(gravadasLic[0]!.modelo).toBe("falso");
  });

  it("divide o documento em chunks e grava todos de uma vez", async () => {
    const { banco, gravadosChunks } = bancoFalso(
      [],
      [{ documentoId: "d1", licitacaoId: "l1", texto: "a ".repeat(4000), origemHash: "h2" }],
    );
    const resumo = await executarTickEmbeddings({ banco, embedder: new EmbedderFalso() });
    expect(resumo.documentos).toBe(1);
    expect(resumo.chunks).toBeGreaterThan(1);
    expect(gravadosChunks).toHaveLength(1);
    expect(gravadosChunks[0]!.chunks[0]!.ordem).toBe(0);
  });

  it("respeita o teto de chunks por documento", async () => {
    const { banco, gravadosChunks } = bancoFalso(
      [],
      [{ documentoId: "d1", licitacaoId: "l1", texto: "a".repeat(500_000), origemHash: "h" }],
    );
    await executarTickEmbeddings({ banco, embedder: new EmbedderFalso(), maxChunksDoc: 3 });
    expect(gravadosChunks[0]!.chunks).toHaveLength(3);
  });

  it("documento sem texto aproveitável não vira chunk nem erro", async () => {
    const { banco, gravadosChunks } = bancoFalso(
      [],
      [{ documentoId: "d1", licitacaoId: "l1", texto: "   ", origemHash: "h" }],
    );
    const resumo = await executarTickEmbeddings({ banco, embedder: new EmbedderFalso() });
    expect(gravadosChunks).toHaveLength(0);
    expect(resumo.erros).toHaveLength(0);
  });

  it("falha do provedor num lote não derruba os outros", async () => {
    const { banco, gravadasLic } = bancoFalso([
      { licitacaoId: "l1", texto: "explode", origemHash: "h1" },
      { licitacaoId: "l2", texto: "ok", origemHash: "h2" },
    ]);
    const embedder = new EmbedderFalso();
    const original = embedder.embed.bind(embedder);
    embedder.embed = async (textos: string[]) => {
      if (textos.includes("explode")) throw new Error("provedor fora");
      return original(textos);
    };
    const resumo = await executarTickEmbeddings({ banco, embedder, loteEmbedding: 1 });
    expect(resumo.erros).toHaveLength(1);
    expect(gravadasLic.map((g) => g.id)).toEqual(["l2"]);
  });

  it("fila vazia é sinalizada", async () => {
    const { banco } = bancoFalso();
    const resumo = await executarTickEmbeddings({ banco, embedder: new EmbedderFalso() });
    expect(resumo.filaVazia).toBe(true);
  });
});
```

- [ ] **Step 4: Rodar e confirmar que falha**

Run: `npx vitest run src/services/busca/worker.embeddings.test.ts`
Expected: FAIL — `Failed to resolve import "./worker.embeddings.server"`.

- [ ] **Step 5: Implementar**

Criar `src/services/busca/worker.embeddings.server.ts`:

```ts
/**
 * WORKER DA FILA DE EMBEDDINGS.
 *
 * Duas camadas, de propósito:
 *
 * - `licitacoes_embedding`, uma linha por licitação sobre objeto+órgão+município.
 *   Cobre as 7.713 licitações do catálogo sem depender de nenhum edital baixado.
 *   É o que faz a busca semântica existir no primeiro dia.
 * - `documento_chunks`, trechos do edital. Cobre o conteúdo, e só existe onde o
 *   worker de arquivos já conseguiu extrair texto.
 *
 * O que decide recálculo é o hash do texto de origem (md5, calculado no banco),
 * não um timestamp: mudou o objeto, muda o hash, e a linha volta para a fila.
 * Exigência direta da ADR-001.
 *
 * Medido em 18/09/2026: ~123 ms por texto em lote contra o Ollama local. Por
 * isso o worker sempre manda lote — um texto por requisição seria 6 s cada.
 */
import { dividirEmChunks, MAX_CHUNKS_DOC } from "./chunk";
import { OllamaEmbedder, paraLiteralPg, type Embedder } from "./embedder";

export interface LicitacaoParaEmbedding {
  licitacaoId: string;
  texto: string;
  origemHash: string;
}

export interface DocumentoParaEmbedding {
  documentoId: string;
  licitacaoId: string;
  texto: string;
  origemHash: string;
}

export interface PortaEmbeddings {
  reservarLicitacoes(limite: number): Promise<LicitacaoParaEmbedding[]>;
  reservarDocumentos(limite: number): Promise<DocumentoParaEmbedding[]>;
  gravarLicitacao(
    licitacaoId: string,
    literal: string,
    modelo: string,
    versao: string,
    origemHash: string,
  ): Promise<void>;
  gravarChunks(
    documentoId: string,
    licitacaoId: string,
    chunks: Array<{ ordem: number; texto: string; literal: string }>,
    modelo: string,
    versao: string,
    origemHash: string,
  ): Promise<void>;
}

export interface OpcoesTickEmbeddings {
  banco: PortaEmbeddings;
  embedder?: Embedder;
  loteLicitacoes?: number;
  loteDocumentos?: number;
  loteEmbedding?: number;
  maxChunksDoc?: number;
  agora?: () => number;
}

export interface ResumoTickEmbeddings {
  licitacoes: number;
  documentos: number;
  chunks: number;
  erros: string[];
  filaVazia: boolean;
  duracaoMs: number;
}

const PADRAO = {
  loteLicitacoes: 100,
  loteDocumentos: 5,
  // Lote do provedor. Grande demais estoura o contexto do modelo; pequeno
  // demais desperdiça o custo fixo da requisição.
  loteEmbedding: 16,
  maxChunksDoc: MAX_CHUNKS_DOC,
};

export async function executarTickEmbeddings(
  opcoes: OpcoesTickEmbeddings,
): Promise<ResumoTickEmbeddings> {
  const cfg = { ...PADRAO, ...opcoes };
  const embedder = opcoes.embedder ?? new OllamaEmbedder();
  const agora = opcoes.agora ?? Date.now;
  const inicio = agora();

  const resumo: ResumoTickEmbeddings = {
    licitacoes: 0,
    documentos: 0,
    chunks: 0,
    erros: [],
    filaVazia: false,
    duracaoMs: 0,
  };

  const licitacoes = await cfg.banco.reservarLicitacoes(cfg.loteLicitacoes);
  const documentos = await cfg.banco.reservarDocumentos(cfg.loteDocumentos);

  if (licitacoes.length === 0 && documentos.length === 0) {
    resumo.filaVazia = true;
    resumo.duracaoMs = agora() - inicio;
    return resumo;
  }

  // --- camada 1: o objeto da licitação
  for (let i = 0; i < licitacoes.length; i += cfg.loteEmbedding) {
    const lote = licitacoes.slice(i, i + cfg.loteEmbedding);
    try {
      const vetores = await embedder.embed(lote.map((l) => l.texto));
      for (const [j, item] of lote.entries()) {
        const vetor = vetores[j];
        if (!vetor) continue;
        await cfg.banco.gravarLicitacao(
          item.licitacaoId,
          paraLiteralPg(vetor),
          embedder.modelo,
          embedder.versao,
          item.origemHash,
        );
        resumo.licitacoes++;
      }
    } catch (erro) {
      // Um lote que falha não cancela os outros: a fila é retomável e o que
      // não foi gravado volta na próxima reserva.
      resumo.erros.push(`licitacoes[${i}]: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }

  // --- camada 2: os trechos do edital
  for (const doc of documentos) {
    try {
      const trechos = dividirEmChunks(doc.texto, { maxChunks: cfg.maxChunksDoc });
      if (trechos.length === 0) continue;

      const literais: Array<{ ordem: number; texto: string; literal: string }> = [];
      for (let i = 0; i < trechos.length; i += cfg.loteEmbedding) {
        const lote = trechos.slice(i, i + cfg.loteEmbedding);
        const vetores = await embedder.embed(lote);
        for (const [j, texto] of lote.entries()) {
          const vetor = vetores[j];
          if (!vetor) continue;
          literais.push({ ordem: i + j, texto, literal: paraLiteralPg(vetor) });
        }
      }

      if (literais.length === 0) continue;

      await cfg.banco.gravarChunks(
        doc.documentoId,
        doc.licitacaoId,
        literais,
        embedder.modelo,
        embedder.versao,
        doc.origemHash,
      );
      resumo.documentos++;
      resumo.chunks += literais.length;
    } catch (erro) {
      resumo.erros.push(
        `documento ${doc.documentoId}: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
    }
  }

  resumo.duracaoMs = agora() - inicio;
  return resumo;
}
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `npx vitest run src/services/busca/worker.embeddings.test.ts`
Expected: PASS, 6 testes.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260918155000_fila_embeddings.sql supabase/APLICAR-FILA-EMBEDDINGS.sql src/services/busca/worker.embeddings.server.ts src/services/busca/worker.embeddings.test.ts
git commit -m "feat(busca): fila e worker de embeddings em duas camadas"
```

---

## Task 10: Porta Supabase e CLI dos embeddings

**Files:**
- Create: `src/services/busca/repositorio.embeddings.server.ts`
- Create: `scripts/gerar-embeddings.ts`
- Modify: `package.json` (script `gerar:embeddings`)

**Interfaces:**
- Consumes: `PortaEmbeddings`, `LicitacaoParaEmbedding`, `DocumentoParaEmbedding` da Task 9; RPCs `reservar_licitacoes_para_embedding`, `reservar_documentos_para_embedding`, `gravar_embedding_licitacao`, `gravar_chunks_documento`, `cobertura_embeddings`.
- Produces: `portaEmbeddingsSupabase(modelo: string): PortaEmbeddings` e `coberturaEmbeddings(): Promise<Record<string, number>>`.

- [ ] **Step 1: Implementar a porta**

Criar `src/services/busca/repositorio.embeddings.server.ts`:

```ts
/**
 * Porta Supabase da fila de embeddings.
 *
 * O vetor viaja como literal de texto (`[0.1,0.2,...]`) e o cast para halfvec
 * acontece dentro da função SQL: o PostgREST não serializa o tipo halfvec, e
 * mandar texto é o caminho que funciona sem driver especial.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  DocumentoParaEmbedding,
  LicitacaoParaEmbedding,
  PortaEmbeddings,
} from "./worker.embeddings.server";

let cliente: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (cliente) return cliente;
  const url = process.env["SUPABASE_URL"];
  const chave = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !chave) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios");
  cliente = createClient(url, chave, { auth: { persistSession: false } });
  return cliente;
}

export function portaEmbeddingsSupabase(modelo: string): PortaEmbeddings {
  return {
    async reservarLicitacoes(limite: number): Promise<LicitacaoParaEmbedding[]> {
      const { data, error } = await db().rpc("reservar_licitacoes_para_embedding", {
        p_limite: limite,
        p_modelo: modelo,
      });
      if (error) throw new Error(`reservar_licitacoes_para_embedding: ${error.message}`);
      return (data ?? []).map((l: Record<string, unknown>) => ({
        licitacaoId: String(l["licitacao_id"]),
        texto: String(l["texto"] ?? ""),
        origemHash: String(l["origem_hash"]),
      }));
    },

    async reservarDocumentos(limite: number): Promise<DocumentoParaEmbedding[]> {
      const { data, error } = await db().rpc("reservar_documentos_para_embedding", {
        p_limite: limite,
        p_modelo: modelo,
      });
      if (error) throw new Error(`reservar_documentos_para_embedding: ${error.message}`);
      return (data ?? []).map((d: Record<string, unknown>) => ({
        documentoId: String(d["documento_id"]),
        licitacaoId: String(d["licitacao_id"]),
        texto: String(d["texto"] ?? ""),
        origemHash: String(d["origem_hash"]),
      }));
    },

    async gravarLicitacao(licitacaoId, literal, modeloUsado, versao, origemHash) {
      const { error } = await db().rpc("gravar_embedding_licitacao", {
        p_licitacao_id: licitacaoId,
        p_embedding: literal,
        p_modelo: modeloUsado,
        p_versao: versao,
        p_origem_hash: origemHash,
      });
      if (error) throw new Error(`gravar_embedding_licitacao: ${error.message}`);
    },

    async gravarChunks(documentoId, licitacaoId, chunks, modeloUsado, versao, origemHash) {
      const { error } = await db().rpc("gravar_chunks_documento", {
        p_documento_id: documentoId,
        p_licitacao_id: licitacaoId,
        p_chunks: chunks,
        p_modelo: modeloUsado,
        p_versao: versao,
        p_origem_hash: origemHash,
      });
      if (error) throw new Error(`gravar_chunks_documento: ${error.message}`);
    },
  };
}

export async function coberturaEmbeddings(): Promise<Record<string, number>> {
  const { data, error } = await db().rpc("cobertura_embeddings");
  if (error) throw new Error(`cobertura_embeddings: ${error.message}`);
  return (data ?? {}) as Record<string, number>;
}
```

- [ ] **Step 2: Implementar o CLI**

Criar `scripts/gerar-embeddings.ts`:

```ts
/**
 * Esvazia a fila de embeddings: vetoriza o objeto das licitações e os trechos
 * dos editais já extraídos.
 *
 *   npm run gerar:embeddings
 *   npm run gerar:embeddings -- 500    (para depois de ~500 vetores)
 *
 * Exige Ollama rodando com o modelo bge-m3:
 *   ollama serve  &&  ollama pull bge-m3
 *
 * Retomável: o que decide o que falta é o hash do texto de origem, então
 * interromper e rodar de novo continua exatamente de onde parou.
 */
import { readFileSync } from "node:fs";

function carregarEnv() {
  const texto = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const linha of texto.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
    const chave = m?.[1];
    const valor = m?.[2];
    if (chave && valor !== undefined) process.env[chave] = valor.replace(/^["']|["']$/g, "");
  }
}

const numeroBR = (n: number) => n.toLocaleString("pt-BR");

async function main() {
  carregarEnv();

  const limiteArg = Number(process.argv[2]);
  const limiteTotal = Number.isInteger(limiteArg) && limiteArg > 0 ? limiteArg : Infinity;

  const { OllamaEmbedder } = await import("../src/services/busca/embedder");
  const repo = await import("../src/services/busca/repositorio.embeddings.server");
  const { executarTickEmbeddings } = await import("../src/services/busca/worker.embeddings.server");

  const embedder = new OllamaEmbedder();

  // Falhar cedo e claro: sem provedor, não há o que fazer.
  try {
    await embedder.embed(["teste de conexão"]);
  } catch (e) {
    console.error(`Provedor de embedding indisponível: ${e instanceof Error ? e.message : String(e)}`);
    console.error("Suba o Ollama com `ollama serve` e garanta `ollama pull bge-m3`.");
    process.exit(1);
  }

  const antes = await repo.coberturaEmbeddings();
  console.log(
    `Licitações: ${numeroBR(antes["licitacoes_com_embedding"] ?? 0)} de ${numeroBR(antes["licitacoes_pesquisaveis"] ?? 0)} vetorizadas.\n` +
      `Documentos: ${numeroBR(antes["documentos_vetorizados"] ?? 0)} de ${numeroBR(antes["documentos_com_texto"] ?? 0)} com texto, ` +
      `${numeroBR(antes["chunks"] ?? 0)} chunks.\n`,
  );

  const banco = repo.portaEmbeddingsSupabase(embedder.modelo);
  const inicio = Date.now();
  let feitos = 0;

  while (feitos < limiteTotal) {
    const resumo = await executarTickEmbeddings({ banco, embedder });
    if (resumo.filaVazia) {
      console.log("Fila vazia.");
      break;
    }
    feitos += resumo.licitacoes + resumo.chunks;
    console.log(
      `+${resumo.licitacoes} licitações, +${resumo.documentos} documentos (${resumo.chunks} chunks) — ${numeroBR(feitos)} vetores`,
    );
    for (const e of resumo.erros.slice(0, 3)) console.log(`   ! ${e}`);
  }

  const depois = await repo.coberturaEmbeddings();
  const cobertura =
    (depois["licitacoes_com_embedding"] ?? 0) / Math.max(depois["licitacoes_pesquisaveis"] ?? 1, 1);
  console.log(
    `\nConcluído em ${Math.round((Date.now() - inicio) / 1000)}s. ` +
      `Cobertura de licitações: ${(cobertura * 100).toFixed(2)}% ` +
      `(a ADR-001 exige ≥ 99% antes de ligar o híbrido).`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: Registrar o script**

Em `package.json`, dentro de `"scripts"`:

```json
"gerar:embeddings": "tsx scripts/gerar-embeddings.ts"
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 5: Exercitar, se o esquema estiver aplicado**

Run: `npm run gerar:embeddings -- 20`
Expected: a cobertura sobe. Se as RPCs não existirem (esquema ainda não colado no SQL Editor), registrar no relatório e seguir — não é falha desta tarefa.

- [ ] **Step 6: Commit**

```bash
git add src/services/busca/repositorio.embeddings.server.ts scripts/gerar-embeddings.ts package.json
git commit -m "feat(busca): porta supabase e CLI dos embeddings"
```

---

## Task 11: Função SQL da busca híbrida e índices HNSW

**Files:**
- Create: `supabase/migrations/20260918160000_busca_hibrida.sql`
- Create: `supabase/APLICAR-BUSCA-HIBRIDA.sql`

**Interfaces:**
- Consumes: tabelas e flag da Task 1; `documento_chunks` e `licitacoes_embedding` das Tasks 1 e 9; a função `buscar_licitacoes` que já existe no banco.
- Produces: `buscar_licitacoes_hibrida(p_filtros jsonb, p_embedding text, p_ordenar text, p_direcao text, p_limite integer, p_deslocamento integer, p_agora timestamptz, p_score_minimo integer) returns jsonb`, devolvendo `{ modo, total, itens: [...] }` com `origem_semantica` e `trecho` em cada item.

- [ ] **Step 1: Escrever a migração**

Criar `supabase/migrations/20260918160000_busca_hibrida.sql`:

```sql
-- Busca híbrida: RRF sobre ranking lexical e ranking vetorial.
--
-- A ordem das operações é o ponto que a ADR-001 cobra. Os filtros relacionais
-- são aplicados ANTES do vetor, sobre a tabela inteira. Filtrar depois de uma
-- busca aproximada é o que faz índice HNSW devolver menos de k resultados — a
-- ADR chama isso de "completude sob filtros" e exige top-10 completo sempre que
-- houver 10 candidatos elegíveis.
--
-- A fusão é Reciprocal Rank Fusion: score = Σ peso / (K + posição). O RRF
-- combina rankings de escalas incomparáveis (ts_rank e distância cosseno) sem
-- precisar normalizar nenhum dos dois.

create index if not exists licitacoes_embedding_hnsw_idx
  on public.licitacoes_embedding
  using hnsw (embedding extensions.halfvec_cosine_ops)
  with (m = 16, ef_construction = 64);

create index if not exists documento_chunks_hnsw_idx
  on public.documento_chunks
  using hnsw (embedding extensions.halfvec_cosine_ops)
  with (m = 16, ef_construction = 64);

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
  v_vetor extensions.halfvec(1024);
  -- Constante do RRF. 60 é o valor da literatura original, nomeado aqui para
  -- que mudá-lo seja uma decisão e não um acidente.
  k_rrf constant integer := 60;
begin
  select hibrido_ativo, peso_lexical, peso_vetorial
    into v_ativo, v_peso_lex, v_peso_vet
    from public.configuracao_busca where id = 1;

  -- Sem flag, sem vetor de consulta ou sem termo: o caminho é o lexical de
  -- sempre. Degradar é o comportamento correto, não uma exceção.
  if not coalesce(v_ativo, false) or p_embedding is null or v_termo is null then
    return public.buscar_licitacoes(
      p_filtros,
      case when p_ordenar = 'relevancia' then 'data_encerramento_proposta' else p_ordenar end,
      p_direcao, p_limite, p_deslocamento, p_agora, p_score_minimo
    ) || jsonb_build_object('modo', 'lexical');
  end if;

  v_vetor := p_embedding::extensions.halfvec(1024);

  return (
    with elegiveis as (
      -- PASSO 1: todos os filtros relacionais, sobre a tabela inteira.
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
    ),
    -- PASSO 2a: ranking lexical dentro do conjunto elegível.
    lexical as (
      select e.id,
             row_number() over (
               order by ts_rank(e.objeto_fts,
                        websearch_to_tsquery('portuguese'::regconfig, v_termo)) desc, e.id
             ) as posicao
        from elegiveis e
       where e.busca_texto ilike '%' || v_termo || '%'
          or e.objeto_fts @@ websearch_to_tsquery('portuguese'::regconfig, v_termo)
       limit 200
    ),
    -- PASSO 2b: ranking vetorial pelo objeto da licitação.
    vetorial_objeto as (
      select e.id,
             row_number() over (order by emb.embedding <=> v_vetor) as posicao
        from elegiveis e
        join public.licitacoes_embedding emb on emb.licitacao_id = e.id
       order by emb.embedding <=> v_vetor
       limit 200
    ),
    -- PASSO 2c: ranking vetorial pelos trechos de edital. Uma licitação entra
    -- pelo seu melhor trecho, e é esse trecho que a interface mostra.
    melhor_chunk as (
      select distinct on (c.licitacao_id)
             c.licitacao_id, c.texto, (c.embedding <=> v_vetor) as distancia
        from public.documento_chunks c
        join elegiveis e on e.id = c.licitacao_id
       order by c.licitacao_id, c.embedding <=> v_vetor
    ),
    vetorial_chunk as (
      select m.licitacao_id as id, m.texto,
             row_number() over (order by m.distancia) as posicao
        from melhor_chunk m
       order by m.distancia
       limit 200
    ),
    -- PASSO 3: fusão RRF. Um ranking em que o id não aparece simplesmente não
    -- contribui — por isso o coalesce entra no id, e não no score.
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
      select e.*, p.score_rrf, p.trecho, p.origem_semantica
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
      'itens', coalesce(
        (select jsonb_agg(to_jsonb(p.*) - 'objeto_fts' - 'busca_texto' order by p.score_rrf desc)
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
```

- [ ] **Step 2: Gerar o gêmeo UTF-8**

```bash
node -e "const fs=require('fs');const sql=fs.readFileSync('supabase/migrations/20260918160000_busca_hibrida.sql','utf8');const cab='-- Cole no SQL Editor do projeto sfjesuzvsupjlkzeijzc.\n-- Aplicar POR ULTIMO, e de preferencia DEPOIS da carga inicial de embeddings:\n-- construir HNSW sobre tabela vazia produz grafo pior.\n\n';fs.writeFileSync('supabase/APLICAR-BUSCA-HIBRIDA.sql',cab+sql,{encoding:'utf8'})"
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260918160000_busca_hibrida.sql supabase/APLICAR-BUSCA-HIBRIDA.sql
git commit -m "feat(busca): funcao SQL hibrida com RRF e indices HNSW"
```

**Nota para quem executa:** esta migração cria índice HNSW. Aplicá-la **depois** da carga inicial de embeddings (Task 10 rodada até a fila esvaziar). Registrar isso no relatório.

---

## Task 12: Camada TypeScript da busca híbrida

**Files:**
- Create: `src/services/busca/hibrida.server.ts`
- Test: `src/services/busca/hibrida.test.ts`

**Interfaces:**
- Consumes: `Embedder`, `EmbedderFalso`, `paraLiteralPg`, `OllamaEmbedder` de `./embedder`.
- Produces:
```ts
interface PortaBuscaRpc { hibrida(args: Record<string, unknown>): Promise<unknown>;
  lexical(args: Record<string, unknown>): Promise<unknown> }
interface EntradaBusca { filtros: Record<string, unknown>; limite?: number; deslocamento?: number;
  embedder?: Embedder; rpc?: PortaBuscaRpc }
interface SaidaBusca { itens: unknown[]; total: number; modo: "hibrido" | "lexical"; degradou: boolean }
buscarComSemantica(entrada: EntradaBusca): Promise<SaidaBusca>
```

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/services/busca/hibrida.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EmbedderFalso } from "./embedder";
import { buscarComSemantica, type PortaBuscaRpc } from "./hibrida.server";

function rpcFalsa(
  resposta: unknown,
  capturar?: (args: Record<string, unknown>) => void,
): PortaBuscaRpc {
  return {
    async hibrida(args) {
      capturar?.(args);
      return resposta;
    },
    async lexical() {
      return { itens: [{ id: "lex" }], total: 1, modo: "lexical" };
    },
  };
}

describe("buscarComSemantica", () => {
  it("embute a palavra-chave e manda o literal para a RPC híbrida", async () => {
    let recebido: Record<string, unknown> = {};
    const saida = await buscarComSemantica({
      filtros: { palavra_chave: "reforma de escola" },
      embedder: new EmbedderFalso(),
      rpc: rpcFalsa({ itens: [{ id: "a" }], total: 1, modo: "hibrido" }, (a) => (recebido = a)),
    });
    expect(String(recebido["p_embedding"])).toMatch(/^\[/);
    expect(saida.modo).toBe("hibrido");
    expect(saida.degradou).toBe(false);
  });

  it("sem palavra-chave não chama o provedor de embedding", async () => {
    let chamou = false;
    const embedder = new EmbedderFalso();
    embedder.embed = async (t) => {
      chamou = true;
      return new EmbedderFalso().embed(t);
    };
    const saida = await buscarComSemantica({
      filtros: { uf: "SP" },
      embedder,
      rpc: rpcFalsa({ itens: [], total: 0, modo: "hibrido" }),
    });
    expect(chamou).toBe(false);
    expect(saida.modo).toBe("lexical");
    expect(saida.degradou).toBe(false);
  });

  it("provedor fora do ar cai para o lexical em vez de estourar", async () => {
    const embedder = new EmbedderFalso();
    embedder.embed = async () => {
      throw new Error("ECONNREFUSED");
    };
    const saida = await buscarComSemantica({
      filtros: { palavra_chave: "escola" },
      embedder,
      rpc: rpcFalsa({ itens: [], total: 0, modo: "hibrido" }),
    });
    expect(saida.modo).toBe("lexical");
    expect(saida.degradou).toBe(true);
    expect(saida.itens).toEqual([{ id: "lex" }]);
  });

  it("falha da RPC híbrida também cai para o lexical", async () => {
    const rpc: PortaBuscaRpc = {
      async hibrida() {
        throw new Error("função não existe");
      },
      async lexical() {
        return { itens: [{ id: "lex" }], total: 1, modo: "lexical" };
      },
    };
    const saida = await buscarComSemantica({
      filtros: { palavra_chave: "escola" },
      embedder: new EmbedderFalso(),
      rpc,
    });
    expect(saida.modo).toBe("lexical");
    expect(saida.degradou).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/services/busca/hibrida.test.ts`
Expected: FAIL — `Failed to resolve import "./hibrida.server"`.

- [ ] **Step 3: Implementar**

Criar `src/services/busca/hibrida.server.ts`:

```ts
/**
 * Orquestra a busca híbrida: consulta → vetor → RPC → resultado.
 *
 * A regra que não pode ser quebrada: qualquer problema aqui vira busca lexical,
 * nunca erro na cara do usuário. A ADR-001 define o lexical como caminho de
 * rollback, e um provedor de embedding fora do ar é exatamente o caso em que o
 * rollback tem que acontecer sozinho.
 *
 * Sem palavra-chave não há o que vetorizar: filtro puro é trabalho relacional,
 * e chamar o provedor ali seria custo sem retorno.
 */
import { OllamaEmbedder, paraLiteralPg, type Embedder } from "./embedder";

export interface PortaBuscaRpc {
  hibrida(args: Record<string, unknown>): Promise<unknown>;
  lexical(args: Record<string, unknown>): Promise<unknown>;
}

export interface EntradaBusca {
  filtros: Record<string, unknown>;
  limite?: number;
  deslocamento?: number;
  embedder?: Embedder;
  rpc?: PortaBuscaRpc;
}

export interface SaidaBusca {
  itens: unknown[];
  total: number;
  modo: "hibrido" | "lexical";
  /** true quando caiu para o lexical por falha, e não por configuração. */
  degradou: boolean;
}

function normalizar(bruto: unknown, degradou: boolean): SaidaBusca {
  const r = (bruto ?? {}) as { itens?: unknown[]; total?: number; modo?: string };
  return {
    itens: r.itens ?? [],
    total: r.total ?? 0,
    modo: r.modo === "hibrido" ? "hibrido" : "lexical",
    degradou,
  };
}

export async function buscarComSemantica(entrada: EntradaBusca): Promise<SaidaBusca> {
  const { filtros, limite = 25, deslocamento = 0 } = entrada;
  const rpc = entrada.rpc;
  if (!rpc) throw new Error("PortaBuscaRpc é obrigatória");

  const termo = String(filtros["palavra_chave"] ?? "").trim();
  const argsBase = { p_filtros: filtros, p_limite: limite, p_deslocamento: deslocamento };

  if (termo.length === 0) {
    return normalizar(await rpc.lexical(argsBase), false);
  }

  const embedder = entrada.embedder ?? new OllamaEmbedder();

  let literal: string;
  try {
    const [vetor] = await embedder.embed([termo]);
    if (!vetor) throw new Error("provedor devolveu lote vazio");
    literal = paraLiteralPg(vetor);
  } catch {
    return normalizar(await rpc.lexical(argsBase), true);
  }

  try {
    return normalizar(await rpc.hibrida({ ...argsBase, p_embedding: literal }), false);
  } catch {
    return normalizar(await rpc.lexical(argsBase), true);
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/services/busca/hibrida.test.ts`
Expected: PASS, 4 testes.

- [ ] **Step 5: Commit**

```bash
git add src/services/busca/hibrida.server.ts src/services/busca/hibrida.test.ts
git commit -m "feat(busca): camada TS da busca hibrida com fallback lexical"
```

---

## Task 13: Oráculo independente do RRF

**Files:**
- Create: `src/services/busca/rrf.ts`
- Test: `src/services/busca/rrf.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `fundirRRF(rankings: RankingRRF[], k?: number): Array<{ id: string; score: number }>`, `interface RankingRRF { peso: number; ids: string[] }`, `K_RRF = 60`.

**Por que esta tarefa existe:** o critério C11 do arquivo 05 exige oráculo independente — "usar um oráculo independente, e não repetir a implementação dentro do teste". O SQL da Task 11 calcula RRF; esta função é a mesma definição escrita a partir da fórmula, e serve para conferir o SQL na validação final. Se as duas divergirem, uma delas está errada, e isso é informação.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/services/busca/rrf.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fundirRRF } from "./rrf";

describe("fundirRRF", () => {
  it("um único ranking preserva a ordem original", () => {
    const r = fundirRRF([{ peso: 1, ids: ["a", "b", "c"] }]);
    expect(r.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("calcula exatamente peso/(k+posição), com posição começando em 1", () => {
    const r = fundirRRF([{ peso: 1, ids: ["a"] }], 60);
    expect(r[0]!.score).toBeCloseTo(1 / 61, 12);
  });

  it("o peso multiplica a contribuição daquele ranking", () => {
    const r = fundirRRF(
      [
        { peso: 2, ids: ["a"] },
        { peso: 1, ids: ["b"] },
      ],
      60,
    );
    expect(r[0]!.id).toBe("a");
    expect(r[0]!.score).toBeCloseTo(2 / 61, 12);
  });

  it("id presente em dois rankings soma as duas contribuições", () => {
    const r = fundirRRF(
      [
        { peso: 1, ids: ["x", "y"] },
        { peso: 1, ids: ["x"] },
      ],
      60,
    );
    const x = r.find((i) => i.id === "x")!;
    expect(x.score).toBeCloseTo(1 / 61 + 1 / 61, 12);
  });

  it("item bem colocado nos dois rankings vence item ótimo em um só", () => {
    const r = fundirRRF([
      { peso: 1, ids: ["so_lexical", "nos_dois"] },
      { peso: 1, ids: ["nos_dois", "so_vetorial"] },
    ]);
    expect(r[0]!.id).toBe("nos_dois");
  });

  it("ranking vazio não contribui", () => {
    const r = fundirRRF([
      { peso: 1, ids: [] },
      { peso: 1, ids: ["a"] },
    ]);
    expect(r).toHaveLength(1);
  });

  it("a ordem é determinística no empate", () => {
    const a = fundirRRF([{ peso: 1, ids: ["b", "a"] }, { peso: 1, ids: ["a", "b"] }]);
    const b = fundirRRF([{ peso: 1, ids: ["b", "a"] }, { peso: 1, ids: ["a", "b"] }]);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/services/busca/rrf.test.ts`
Expected: FAIL — `Failed to resolve import "./rrf"`.

- [ ] **Step 3: Implementar**

Criar `src/services/busca/rrf.ts`:

```ts
/**
 * Reciprocal Rank Fusion, escrito a partir da definição.
 *
 * Esta é a referência independente que o critério C11 do arquivo 05 exige: o
 * teste da busca não pode repetir a implementação de produção dentro de si. O
 * SQL da `buscar_licitacoes_hibrida` calcula a mesma coisa por outro caminho;
 * confrontar os dois é o que dá confiança em qualquer um deles.
 *
 *   score(d) = Σ_r  peso_r / (k + posição_r(d))
 *
 * `posição` começa em 1. `k` amortece as primeiras posições: sem ele, o 1º
 * lugar de um único ranking dominaria toda a fusão.
 */
export const K_RRF = 60;

export interface RankingRRF {
  peso: number;
  /** Ids em ordem de relevância: o primeiro está na posição 1. */
  ids: string[];
}

export function fundirRRF(
  rankings: RankingRRF[],
  k: number = K_RRF,
): Array<{ id: string; score: number }> {
  const scores = new Map<string, number>();

  for (const ranking of rankings) {
    ranking.ids.forEach((id, indice) => {
      const posicao = indice + 1;
      scores.set(id, (scores.get(id) ?? 0) + ranking.peso / (k + posicao));
    });
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    // Desempate por id: a ordem precisa ser a mesma entre execuções.
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/services/busca/rrf.test.ts`
Expected: PASS, 7 testes.

- [ ] **Step 5: Commit**

```bash
git add src/services/busca/rrf.ts src/services/busca/rrf.test.ts
git commit -m "test(busca): oraculo independente do RRF (criterio C11)"
```

---

## Task 14: Interface — modo de busca e trecho que casou

**Files:**
- Modify: `src/services/licitacoes.functions.ts`
- Modify: `src/routes/licitacoes.index.tsx` (campo de busca na linha ~446 e a lista de resultados)

**Interfaces:**
- Consumes: `buscarComSemantica`, `SaidaBusca`, `PortaBuscaRpc` da Task 12.
- Produces: nenhuma API nova para tarefas seguintes.

- [ ] **Step 1: Ler o que existe antes de mexer**

Run:
```bash
sed -n '1,90p' src/services/licitacoes.functions.ts
sed -n '430,470p' src/routes/licitacoes.index.tsx
```

Entender como a função de servidor chama `buscar_licitacoes` hoje e como `filtros.palavra_chave` chega até ela. **Seguir o padrão existente do arquivo**; não reescrever a rota nem trocar biblioteca.

- [ ] **Step 2: Ligar a busca semântica na função de servidor**

Em `src/services/licitacoes.functions.ts`, onde hoje existe a chamada a `buscar_licitacoes`, passar a usar `buscarComSemantica`, com uma porta que encaminha para as duas RPCs. A porta mora aqui, e não dentro de `hibrida.server.ts`, para aquele módulo continuar testável sem rede:

```ts
import { buscarComSemantica, type PortaBuscaRpc } from "./busca/hibrida.server";

const portaRpc: PortaBuscaRpc = {
  async hibrida(args) {
    const { data, error } = await db().rpc("buscar_licitacoes_hibrida", args);
    if (error) throw new Error(error.message);
    return data;
  },
  async lexical(args) {
    const { data, error } = await db().rpc("buscar_licitacoes", args);
    if (error) throw new Error(error.message);
    return data;
  },
};
```

O retorno da função de servidor passa a incluir `modo` e `degradou`. **Não remover nenhum campo que a tela já consome** — a mudança é aditiva.

- [ ] **Step 3: Mostrar o modo e o trecho na tela**

Em `src/routes/licitacoes.index.tsx`:

- o placeholder do campo de busca passa a depender do modo devolvido. Com `modo === "hibrido"`: `"Busque por palavras ou por ideia (ex.: reforma de escola)…"`. Com `modo === "lexical"`, manter exatamente o texto atual — a tela não pode prometer semântica que não está ligada;
- cada resultado com `origem_semantica` verdadeira mostra o `trecho` que casou, em texto secundário, truncado, prefixado pelo nome do documento;
- quando `degradou` for verdadeiro, mostrar um aviso discreto: `"Busca semântica indisponível; exibindo resultados por palavra-chave."`

Usar os componentes já presentes no arquivo (`Badge`, `Card`, classes Tailwind existentes). Nenhuma dependência nova.

- [ ] **Step 4: Verificar que compila e que a suíte segue verde**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/services/licitacoes.functions.ts src/routes/licitacoes.index.tsx
git commit -m "feat(busca): expor modo semantico e trecho na tela de licitacoes"
```

---

## Task 15: Harness do experimento da ADR-001

**Files:**
- Create: `scripts/experimento-busca.mjs`
- Create: `docs/superpowers/specs/consultas-avaliacao.json`
- Modify: `package.json` (script `experimento:busca`)

**Interfaces:**
- Consumes: RPCs `buscar_licitacoes`, `buscar_licitacoes_hibrida`, `cobertura_embeddings`; Ollama.
- Produces: relatório JSON em `logs/experimento-busca-<AAAA-MM-DD>.json`.

- [ ] **Step 1: Criar o conjunto de consultas semente**

Criar `docs/superpowers/specs/consultas-avaliacao.json`:

```json
{
  "versao": 1,
  "gerado_em": "2026-09-18",
  "instrucoes": "A ADR-001 exige no minimo 100 consultas reais e julgamento de DOIS avaliadores numa escala 0-3 (irrelevante, relacionado, relevante, ideal), com divergencia resolvida por consenso e sem revelar qual mecanismo produziu cada resultado. As consultas abaixo sao uma semente representativa, NAO um conjunto de avaliacao completo. O campo julgamentos comeca vazio de proposito: preenche-lo e trabalho humano, e o gate de relevancia da ADR permanece NAO CUMPRIDO enquanto estiver vazio.",
  "consultas": [
    { "id": "q001", "texto": "reforma de escola", "nota": "sinonimo esperado: manutencao predial em unidade de ensino", "julgamentos": [] },
    { "id": "q002", "texto": "pavimentacao asfaltica", "nota": "sem acento de proposito", "julgamentos": [] },
    { "id": "q003", "texto": "pavimentação asfáltica", "nota": "par acentuado de q002", "julgamentos": [] },
    { "id": "q004", "texto": "aquisicao de medicamentos", "julgamentos": [] },
    { "id": "q005", "texto": "coleta de lixo urbano", "julgamentos": [] },
    { "id": "q006", "texto": "merenda escolar", "julgamentos": [] },
    { "id": "q007", "texto": "software de gestao", "julgamentos": [] },
    { "id": "q008", "texto": "obra de drenagem", "julgamentos": [] },
    { "id": "q009", "texto": "locacao de veiculos", "julgamentos": [] },
    { "id": "q010", "texto": "servicos de vigilancia patrimonial", "julgamentos": [] },
    { "id": "q011", "texto": "TR", "nota": "sigla curta, abaixo do tamanho do trigrama", "julgamentos": [] },
    { "id": "q012", "texto": "reforma ou ampliacao", "nota": "operador em portugues, que o websearch_to_tsquery nao entende", "julgamentos": [] }
  ]
}
```

- [ ] **Step 2: Escrever o harness**

Criar `scripts/experimento-busca.mjs`. Ele mede; ele não decide que o gate passou:

```js
/**
 * Harness do experimento exigido pela ADR-001.
 *
 * Mede cobertura de embeddings, latencia p50/p95/p99, completude sob filtros e
 * a diferenca entre o top-10 lexical e o top-10 hibrido. Somente leitura.
 *
 *   npm run experimento:busca
 *
 * O que ele NAO faz: julgar relevancia. NDCG e MRR exigem os julgamentos
 * humanos de consultas-avaliacao.json, e enquanto eles estiverem vazios o
 * relatorio diz "gate de relevancia NAO CUMPRIDO" — que e a verdade.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

for (const linha of readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
  if (m?.[1] && m[2] !== undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const URL_SB = process.env.SUPABASE_URL;
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OLLAMA = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const MODELO = process.env.EMBEDDING_MODELO ?? "bge-m3";

const cabecalhos = { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, "content-type": "application/json" };

async function rpc(nome, args) {
  const r = await fetch(`${URL_SB}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: cabecalhos,
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`${nome}: HTTP ${r.status} ${await r.text()}`);
  return r.json();
}

async function embutir(texto) {
  const r = await fetch(`${OLLAMA}/api/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: MODELO, input: texto }),
  });
  if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`);
  const j = await r.json();
  return `[${j.embeddings[0].join(",")}]`;
}

function percentil(valores, p) {
  if (valores.length === 0) return null;
  const ordenado = [...valores].sort((a, b) => a - b);
  const i = Math.min(ordenado.length - 1, Math.ceil((p / 100) * ordenado.length) - 1);
  return ordenado[Math.max(i, 0)];
}

const consultas = JSON.parse(
  readFileSync(new URL("../docs/superpowers/specs/consultas-avaliacao.json", import.meta.url), "utf8"),
);

const relatorio = {
  gerado_em: new Date().toISOString(),
  modelo: MODELO,
  cobertura: null,
  consultas: [],
  latencia_ms: {},
  gates: {},
  falhas: [],
};

relatorio.cobertura = await rpc("cobertura_embeddings", {});
const pesquisaveis = relatorio.cobertura.licitacoes_pesquisaveis ?? 0;
const comEmbedding = relatorio.cobertura.licitacoes_com_embedding ?? 0;
const taxa = pesquisaveis > 0 ? comEmbedding / pesquisaveis : 0;
relatorio.gates.cobertura = { valor: taxa, minimo: 0.99, cumprido: taxa >= 0.99 };

// Aquecimento: a primeira chamada carrega o modelo em memoria (medido: 6,9 s).
await embutir("aquecimento").catch((e) => relatorio.falhas.push(`aquecimento: ${e.message}`));

const latencias = [];

for (const consulta of consultas.consultas) {
  const registro = { id: consulta.id, texto: consulta.texto, lexical: [], hibrido: [], erro: null };
  try {
    const literal = await embutir(consulta.texto);

    const t0 = Date.now();
    const hibrido = await rpc("buscar_licitacoes_hibrida", {
      p_filtros: { palavra_chave: consulta.texto },
      p_embedding: literal,
      p_limite: 10,
    });
    latencias.push(Date.now() - t0);

    const lexical = await rpc("buscar_licitacoes", {
      p_filtros: { palavra_chave: consulta.texto },
      p_limite: 10,
    });

    registro.modo = hibrido.modo;
    registro.hibrido = (hibrido.itens ?? []).map((i) => i.id);
    registro.lexical = (lexical.itens ?? []).map((i) => i.id);
    registro.total_elegiveis = hibrido.total ?? 0;
    registro.novos_no_hibrido = registro.hibrido.filter((id) => !registro.lexical.includes(id)).length;
    // Completude sob filtros: com >= 10 elegiveis, tem que voltar 10.
    registro.completo = registro.total_elegiveis >= 10 ? registro.hibrido.length === 10 : true;
  } catch (e) {
    registro.erro = e.message;
    relatorio.falhas.push(`${consulta.id}: ${e.message}`);
  }
  relatorio.consultas.push(registro);
}

relatorio.latencia_ms = {
  amostras: latencias.length,
  p50: percentil(latencias, 50),
  p95: percentil(latencias, 95),
  p99: percentil(latencias, 99),
};
relatorio.gates.latencia = {
  p95: relatorio.latencia_ms.p95,
  meta_p95: 300,
  p99: relatorio.latencia_ms.p99,
  meta_p99: 600,
  cumprido:
    relatorio.latencia_ms.p95 !== null &&
    relatorio.latencia_ms.p95 <= 300 &&
    relatorio.latencia_ms.p99 <= 600,
};

const incompletas = relatorio.consultas.filter((c) => c.completo === false).length;
relatorio.gates.completude_sob_filtros = { consultas_incompletas: incompletas, cumprido: incompletas === 0 };

const julgadas = consultas.consultas.filter((c) => (c.julgamentos ?? []).length > 0).length;
relatorio.gates.relevancia = {
  consultas_julgadas: julgadas,
  minimo_adr: 100,
  cumprido: false,
  observacao:
    julgadas === 0
      ? "NAO CUMPRIDO: nenhum julgamento humano registrado. NDCG/MRR nao podem ser calculados e o gate 3 da ADR-001 continua aberto."
      : `NAO CUMPRIDO: ${julgadas} consultas julgadas; a ADR-001 exige no minimo 100, com dois avaliadores.`,
};

relatorio.gates.pode_ligar_hibrido = Object.entries(relatorio.gates)
  .filter(([k]) => k !== "pode_ligar_hibrido")
  .every(([, g]) => g.cumprido === true);

mkdirSync(new URL("../logs/", import.meta.url), { recursive: true });
const destino = new URL(
  `../logs/experimento-busca-${new Date().toISOString().slice(0, 10)}.json`,
  import.meta.url,
);
writeFileSync(destino, JSON.stringify(relatorio, null, 2), "utf8");

console.log(`Cobertura de embeddings: ${(taxa * 100).toFixed(2)}% (gate: >= 99%)`);
console.log(`Latencia p95: ${relatorio.latencia_ms.p95} ms | p99: ${relatorio.latencia_ms.p99} ms`);
console.log(`Consultas com falha: ${relatorio.falhas.length}`);
console.log(`Gate de relevancia: ${relatorio.gates.relevancia.observacao}`);
console.log(`\nPode ligar o hibrido? ${relatorio.gates.pode_ligar_hibrido ? "SIM" : "NAO"}`);
```

- [ ] **Step 3: Registrar o script**

Em `package.json`, dentro de `"scripts"`:

```json
"experimento:busca": "node scripts/experimento-busca.mjs"
```

- [ ] **Step 4: Rodar, se o esquema e os embeddings existirem**

Run: `npm run experimento:busca`
Expected: relatório gravado em `logs/`, terminando em `Pode ligar o hibrido? NAO` — porque o gate de relevância está aberto por falta de julgamento humano. **Esse "NÃO" é o resultado correto**, não uma falha da implementação.

- [ ] **Step 5: Commit**

```bash
git add scripts/experimento-busca.mjs docs/superpowers/specs/consultas-avaliacao.json package.json
git commit -m "feat(busca): harness do experimento exigido pela ADR-001"
```

---

## Task 16: Fechamento — documentação e estado real

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture/adr-001-busca-vetorial.md`

**Interfaces:**
- Consumes: tudo que as tarefas anteriores produziram.
- Produces: nada de código.

- [ ] **Step 1: Atualizar a seção de arquitetura de busca no README**

Substituir a seção "Arquitetura de busca" para descrever o que passou a existir: pipeline de download e extração de editais, embeddings em duas camadas, busca híbrida atrás de flag, e como operar (`npm run baixar:documentos`, `npm run gerar:embeddings`, `npm run experimento:busca`, `npm run verificar:busca`). Dizer explicitamente que a busca de produção **continua lexical** enquanto `configuracao_busca.hibrido_ativo` for `false`.

- [ ] **Step 2: Acrescentar a seção de estado à ADR-001**

Não reescrever a decisão. Acrescentar ao fim, antes de "Referências":

```markdown
## Estado da implementação (2026-09-18)

A infraestrutura descrita em "Experimento exigido" foi construída: pipeline de
download e extração de editais, embeddings em duas camadas (`bge-m3`, 1024
dimensões, Ollama local), busca híbrida por RRF com pré-filtragem relacional e
harness de medição (`npm run experimento:busca`).

A decisão desta ADR permanece em vigor. `configuracao_busca.hibrido_ativo` nasce
`false` e o caminho de produção continua lexical. Os gates 1, 4 e 5 são medidos
automaticamente pelo harness; o gate 3 (ganho de relevância de ao menos 10%)
exige as 100 consultas julgadas por dois avaliadores descritas acima e **não
está cumprido**. Ligar o híbrido antes disso contraria esta ADR.
```

- [ ] **Step 3: Rodar a validação completa**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: tudo verde.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/architecture/adr-001-busca-vetorial.md
git commit -m "docs(busca): registrar estado da implementacao e gates pendentes"
```

---

## Self-Review

**1. Cobertura da spec.**

| seção da spec | tarefa |
|---|---|
| §4[A] worker de bytes e extração | Tasks 2, 3, 4, 5, 6 |
| §4[B] worker de embeddings | Tasks 7, 8, 9, 10 |
| §4[C] busca híbrida | Tasks 11, 12, 13 |
| §4[D] harness de experimento | Task 15 |
| §5 interface | Task 14 |
| §6 testes | dentro de cada tarefa; oráculo independente isolado na Task 13 |
| §7 migração e operação | Tasks 1, 9, 11; scripts npm nas Tasks 1, 6, 10, 15 |
| §3 relação com a ADR-001 | Task 16 |
| §8 riscos | teto de bytes (Task 3), teto de chunks (Task 8), fallback (Task 12), halfvec (Task 1) |

Sem lacunas.

**2. Varredura de placeholders.** Nenhum "TBD", "TODO" ou "implementar depois". A Task 14 é a única que descreve mudanças em prosa em vez de código completo, e é deliberado: ela mexe em dois arquivos existentes que o executor precisa ler antes, e o passo 1 manda fazer exatamente isso. Os trechos de código que ela introduz (a `portaRpc`) estão escritos por inteiro.

**3. Consistência de tipos.** Verificado:
- `PortaArquivos`, `ArquivoReservado`, `GravacaoArquivo` (Task 5) → consumidos com os mesmos nomes na Task 6.
- `Embedder`, `paraLiteralPg`, `DIMENSOES`, `EmbedderFalso`, `OllamaEmbedder` (Task 7) → usados sem renomear nas Tasks 9, 10 e 12.
- `PortaEmbeddings` e os dois tipos de reserva (Task 9) → implementados por `portaEmbeddingsSupabase` (Task 10) com a mesma assinatura, incluindo a ordem dos parâmetros de `gravarChunks`.
- `PortaBuscaRpc` (Task 12) → implementada na Task 14 com os dois mesmos métodos.
- O vetor é `string` (literal `[...]`) em toda a cadeia TypeScript; o cast para `halfvec(1024)` acontece só dentro do SQL das Tasks 9 e 11.
- Nomes de RPC conferidos entre quem cria (Tasks 1, 9, 11) e quem chama (Tasks 6, 10, 14, 15).

**4. Correção aplicada durante a revisão.** O bloco "Produces" da Task 1 anunciava `reservar_textos_para_embedding` e `gravar_embeddings`, funções que não existem: elas foram detalhadas na Task 9 com nomes mais precisos (`reservar_licitacoes_para_embedding`, `reservar_documentos_para_embedding`, `gravar_embedding_licitacao`, `gravar_chunks_documento`). Corrigir o cabeçalho da Task 1 para listar apenas `reservar_arquivos` e `gravar_arquivo`, que são o que ela de fato cria.
