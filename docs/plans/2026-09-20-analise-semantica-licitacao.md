# Análise Semântica de Licitação Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Adicionar ao detalhe da licitação uma análise integral, semântica, estruturada, citável, cacheada e honesta sobre a cobertura documental.

**Architecture:** Uma RPC recupera evidências vetoriais estritamente dentro da licitação e um repositório lê o texto integral disponível. Um orquestrador server-only faz map-reduce do conteúdo, combina evidências temáticas e metadados, valida a síntese JSON e persiste o cache por fingerprint. A UI abre um painel lateral sob demanda e representa todos os estados de cobertura e execução.

**Tech Stack:** React 19, TanStack Start/Query/Router, TypeScript, Zod, Supabase/Postgres/pgvector, Ollama ou endpoint OpenAI-compatible, Vitest, Tailwind/shadcn.

---

### Task 1: Contrato SQL, cache, lease e recuperação vetorial

**Files:**
- Create: `supabase/migrations/20260920160000_analise_semantica_licitacao.sql`
- Create: `supabase/APLICAR-ANALISE-LICITACAO.sql`
- Create: `src/services/analise/repositorio.analise.test.ts`
- Create: `src/services/analise/repositorio.analise.server.ts`

**Step 1: Write the failing repository contract tests**

Testar com uma porta Supabase falsa:

```ts
it("nunca mistura chunks de outra licitação", async () => {
  const fontes = await repositorio.buscarEvidencias({ licitacaoId: "lic-a", vetor, temas });
  expect(fontes.every((f) => f.licitacaoId === "lic-a")).toBe(true);
});

it("reutiliza somente cache com o mesmo fingerprint", async () => {
  expect(await repositorio.obterCacheValido("lic-a", "fp-atual")).toBeNull();
});
```

**Step 2: Run the test and verify it fails**

Run: `npx vitest run src/services/analise/repositorio.analise.test.ts`

Expected: FAIL porque o módulo ainda não existe.

**Step 3: Add the database contract**

Criar `public.licitacoes_analises` com:

```sql
licitacao_id uuid primary key references public.licitacoes(id) on delete cascade,
estado text not null check (estado in ('processando','pronta','erro')),
resultado jsonb,
fontes jsonb not null default '[]',
cobertura jsonb not null default '{}',
fingerprint text,
modelo text,
prompt_versao text not null,
algoritmo_versao text not null,
lease_id uuid,
lease_expira_em timestamptz,
erro text,
gerado_em timestamptz,
atualizado_em timestamptz not null default now()
```

Habilitar RLS sem policy pública. Criar RPCs `buscar_chunks_analise`, `adquirir_lease_analise`, `concluir_analise_licitacao` e `falhar_analise_licitacao`, todas `security definer`, `search_path` fixo, `revoke all` e `grant execute ... to service_role`. `buscar_chunks_analise` deve filtrar `licitacao_id`, documento ativo e modelo antes de ordenar por `<=>`.

Manter o arquivo `APLICAR-*` byte a byte equivalente à migração.

**Step 4: Implement the server-only repository**

Expor portas tipadas para:

```ts
obterMateriaPrima(id): Promise<{ licitacao; documentos; chunksDisponiveis }>;
buscarChunks(id, embedding, modelo, limite): Promise<Evidencia[]>;
obterAnalise(id): Promise<LinhaAnalise | null>;
adquirirLease(id, fingerprint, force): Promise<{ adquirido: boolean; linha }>;
concluir(...): Promise<void>;
falhar(...): Promise<void>;
```

O texto integral deve sair apenas desta camada server-only.

**Step 5: Run focused tests and format checks**

Run:

```bash
npx vitest run src/services/analise/repositorio.analise.test.ts
npx eslint src/services/analise/repositorio.analise.server.ts src/services/analise/repositorio.analise.test.ts
npx prettier --check supabase/migrations/20260920160000_analise_semantica_licitacao.sql supabase/APLICAR-ANALISE-LICITACAO.sql src/services/analise/repositorio.analise.server.ts src/services/analise/repositorio.analise.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add supabase/migrations/20260920160000_analise_semantica_licitacao.sql supabase/APLICAR-ANALISE-LICITACAO.sql src/services/analise/repositorio.analise.server.ts src/services/analise/repositorio.analise.test.ts
git commit -m "feat(analise): criar persistencia e recuperacao vetorial"
```

### Task 2: Núcleo puro de cobertura, contexto e resposta citável

**Files:**
- Create: `src/services/analise/contrato.ts`
- Create: `src/services/analise/contexto.ts`
- Create: `src/services/analise/contexto.test.ts`

**Step 1: Write failing domain tests**

Cobrir:

- consultas temáticas obrigatórias;
- divisão integral sem perder caracteres úteis;
- teto por lote sem descartar blocos da cobertura;
- deduplicação de evidências;
- cálculo de `completa`/`parcial`/`indisponivel`;
- fingerprint estável e sensível a hashes/estado/versão;
- rejeição de citações que não pertencem às fontes;
- prompt que delimita documento não confiável.

Exemplo:

```ts
it("marca parcial quando um documento ativo falhou", () => {
  expect(calcularCobertura([{ ativo: true, estado: "erro" }]).estado).toBe("parcial");
});

it("não aceita fonte inventada pelo modelo", () => {
  expect(() => validarFontes(resultadoCom("fonte-x"), fontes)).toThrow(/fonte/i);
});
```

**Step 2: Verify failure**

Run: `npx vitest run src/services/analise/contexto.test.ts`

Expected: FAIL por imports ausentes.

**Step 3: Implement schemas and pure functions**

Definir Zod e tipos para:

```ts
AnaliseResultado = {
  veredito: "favoravel" | "atencao" | "desfavoravel" | "insuficiente";
  confianca: "alta" | "media" | "baixa";
  resumoExecutivo: string;
  pontosImportantes: ItemCitavel[];
  prazos: ItemCitavel[];
  requisitos: ItemCitavel[];
  riscos: ItemCitavel[];
  proximosPassos: string[];
};
```

Cada `ItemCitavel` contém `titulo`, `descricao`, `severidade` quando aplicável e `fonteIds`. Criar constantes `PROMPT_VERSAO`, `ALGORITMO_VERSAO`, temas e tetos. Nenhuma função deste arquivo acessa rede/banco.

**Step 4: Run tests and quality checks**

Run:

```bash
npx vitest run src/services/analise/contexto.test.ts
npx eslint src/services/analise/contrato.ts src/services/analise/contexto.ts src/services/analise/contexto.test.ts
npx prettier --check src/services/analise/contrato.ts src/services/analise/contexto.ts src/services/analise/contexto.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/services/analise/contrato.ts src/services/analise/contexto.ts src/services/analise/contexto.test.ts
git commit -m "feat(analise): definir cobertura e contrato citavel"
```

### Task 3: Provedor de chat e orquestração map-reduce + semântica

**Files:**
- Create: `src/services/analise/gerador.server.ts`
- Create: `src/services/analise/orquestrador.server.ts`
- Create: `src/services/analise/orquestrador.test.ts`
- Create: `src/services/analise/analise.smoke.test.ts`

**Step 1: Write failing orchestration tests with fakes**

Validar:

- cache válido não chama embedder nem modelo;
- texto integral percorre todos os blocos;
- temas produzem embeddings e recuperação por licitação;
- sem texto não chama modelo;
- lease perdido retorna `processando`;
- falha/timeout libera lease e preserva erro;
- JSON inválido e fonte inventada são rejeitados;
- `force` ignora cache, mas não fura lease ativo.

**Step 2: Verify failure**

Run: `npx vitest run src/services/analise/orquestrador.test.ts`

Expected: FAIL por módulos ausentes.

**Step 3: Implement the configurable chat provider**

Usar `fetch` server-only contra `${ANALISE_API_URL}/chat/completions`, bearer opcional e timeout por `AbortSignal.timeout`. Defaults de desenvolvimento:

```ts
url = "http://127.0.0.1:11434/v1";
modelo = process.env.ANALISE_MODELO; // obrigatório para gerar
timeoutMs = 180_000;
```

Não registrar headers, chave nem conteúdo integral. Aceitar injeção de `fetch` nos testes.

**Step 4: Implement the orchestration**

Fluxo mínimo:

1. obter matéria-prima e calcular fingerprint;
2. devolver cache válido;
3. adquirir lease;
4. mapear todos os blocos integrais para fatos compactos com IDs de fonte;
5. embutir temas com `OllamaEmbedder` e recuperar top-K por tema; se embedding falhar, continuar com cobertura integral e marcar degradação;
6. sintetizar JSON, validar schema e IDs de fonte;
7. persistir `pronta`, cobertura e fontes;
8. em exceção, persistir erro sanitizado e relançar mensagem operacional.

**Step 5: Add opt-in live smoke**

`analise.smoke.test.ts` só executa com `ANALISE_SMOKE=1` e um `ANALISE_MODELO` configurado. Validar estrutura e citações, nunca frase exata.

**Step 6: Run focused tests and checks**

Run:

```bash
npx vitest run src/services/analise/orquestrador.test.ts
npx eslint src/services/analise/gerador.server.ts src/services/analise/orquestrador.server.ts src/services/analise/orquestrador.test.ts src/services/analise/analise.smoke.test.ts
npx prettier --check src/services/analise/gerador.server.ts src/services/analise/orquestrador.server.ts src/services/analise/orquestrador.test.ts src/services/analise/analise.smoke.test.ts
```

Expected: PASS; smoke SKIP sem flag.

**Step 7: Commit**

```bash
git add src/services/analise/gerador.server.ts src/services/analise/orquestrador.server.ts src/services/analise/orquestrador.test.ts src/services/analise/analise.smoke.test.ts
git commit -m "feat(analise): gerar sintese integral com evidencias"
```

### Task 4: Server functions, DTO e React Query

**Files:**
- Modify: `src/lib/dto.ts`
- Modify: `src/services/licitacoes.functions.ts`
- Modify: `src/services/api.ts`
- Create: `src/services/analise/apresentacao.ts`
- Create: `src/services/analise/apresentacao.test.ts`

**Step 1: Write failing presentation/state tests**

Testar mapeamento de `nunca`, `processando`, `pronta`, `parcial`, `desatualizada`, `indisponivel` e `erro`, incluindo texto de ação e se regeneração é permitida.

**Step 2: Verify failure**

Run: `npx vitest run src/services/analise/apresentacao.test.ts`

Expected: FAIL.

**Step 3: Add DTO and server endpoints**

Adicionar `AnaliseLicitacaoDTO` e fontes/cobertura tipadas. Criar:

```ts
obterAnaliseLicitacaoFn({ id }): Promise<AnaliseLicitacaoDTO>;
gerarAnaliseLicitacaoFn({ id, forcar }): Promise<AnaliseLicitacaoDTO>;
```

Validar UUID e boolean com Zod. Importar módulos server-only dinamicamente dentro do handler. Consulta não gera; mutation gera.

**Step 4: Add hooks**

Criar `useAnaliseLicitacao(id, ativo)` e `useGerarAnaliseLicitacao(id)`. Mutation atualiza exatamente `['analise-licitacao', id]`, impede retry automático para erro de configuração e mantém a última análise durante regeneração.

**Step 5: Run tests and checks**

Run:

```bash
npx vitest run src/services/analise/apresentacao.test.ts
npx tsc --noEmit
npx eslint src/lib/dto.ts src/services/licitacoes.functions.ts src/services/api.ts src/services/analise/apresentacao.ts src/services/analise/apresentacao.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/lib/dto.ts src/services/licitacoes.functions.ts src/services/api.ts src/services/analise/apresentacao.ts src/services/analise/apresentacao.test.ts
git commit -m "feat(analise): expor analise ao cliente"
```

### Task 5: Painel de análise no detalhe

**Files:**
- Create: `src/components/AnaliseLicitacaoSheet.tsx`
- Modify: `src/routes/licitacoes.$id.tsx`

**Step 1: Implement the accessible panel from tested states**

Criar `AnaliseLicitacaoSheet` com `Sheet`, `ScrollArea`, `Badge`, `Alert`, `Accordion`, `Skeleton` e `Button`. O componente recebe `licitacaoId`, `open`, `onOpenChange`; a consulta só fica ativa quando aberto.

Regras visuais:

- botão **Gerar análise** no estado inicial;
- skeleton e texto de duração durante processamento;
- cabeçalho com veredito/confiança/data/modelo;
- aviso âmbar em cobertura parcial/degradação;
- seções para resumo, pontos, prazos, requisitos, riscos, próximos passos;
- evidências expansíveis com nome/tipo/ordem/trecho;
- **Regenerar** exige apenas um segundo clique normal, sem diálogo destrutivo;
- foco inicial, título e descrição acessíveis.

**Step 2: Wire the detail button**

Adicionar `Sparkles` e o botão **Análise** às ações do `AppShell`, antes de prioridade. Remover o botão Voltar duplicado da rota, pois o shell já o fornece. Abrir o painel sem navegar nem gerar automaticamente.

**Step 3: Run static validation**

Run:

```bash
npx tsc --noEmit
npx eslint src/components/AnaliseLicitacaoSheet.tsx 'src/routes/licitacoes.$id.tsx'
npx prettier --check src/components/AnaliseLicitacaoSheet.tsx 'src/routes/licitacoes.$id.tsx'
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/components/AnaliseLicitacaoSheet.tsx 'src/routes/licitacoes.$id.tsx'
git commit -m "feat(analise): adicionar painel no detalhe da licitacao"
```

### Task 6: Operação, documentação e validação integrada

**Files:**
- Modify: `README.md`
- Modify: `scripts/verificar-busca-semantica.mjs`
- Modify: `.env.example` if it exists; otherwise document env vars only in `README.md`

**Step 1: Extend read-only diagnostics**

Fazer `npm run verificar:busca` confirmar tabela, RPC e contagens de análises por estado sem revelar texto ou segredos.

**Step 2: Document configuration and deployment**

Documentar:

```text
ANALISE_API_URL=https://provedor.example/v1
ANALISE_API_KEY=...
ANALISE_MODELO=...
ANALISE_TIMEOUT_MS=180000
```

Incluir Ollama local compatível, aplicação da migração e aviso de que cloud não alcança localhost.

**Step 3: Run full verification**

Run:

```bash
npm test
npx tsc --noEmit
npx eslint <todos-os-arquivos-TypeScript-tocados>
npx prettier --check <todos-os-arquivos-tocados>
npm run build
npm run verificar:busca
git diff --check
git status --short
```

Expected: 272 testes anteriores + novos passando; TypeScript/build/directed lint/format PASS; diagnóstico remoto PASS depois da migração. `npm run lint` global permanece fora do gate enquanto o baseline de 183 erros não relacionados existir.

**Step 4: Browser acceptance**

Executar o app e validar no navegador:

1. abrir uma licitação;
2. botão **Análise** visível e acessível por teclado;
3. painel abre sem gerar sozinho;
4. estados inicial, indisponível/erro e pronto não quebram o layout;
5. desktop e largura móvel;
6. nenhuma chamada ao PNCP;
7. evidências correspondem à mesma licitação.

**Step 5: Commit**

```bash
git add README.md scripts/verificar-busca-semantica.mjs
git commit -m "docs(analise): documentar configuracao e diagnostico"
```

### Final review gate

Após cada tarefa: revisão de conformidade com esta especificação e, somente quando aprovada, revisão de qualidade. Ao final: revisão transversal de segurança, cobertura, citações, concorrência e UX; corrigir e repetir os gates antes da entrega.

