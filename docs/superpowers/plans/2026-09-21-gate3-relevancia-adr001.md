# Gate 3 da ADR-001: relevância julgada por humanos, calculada pelo harness

## Decisões para o usuário

Situação em 21/09/2026. As tarefas estão escritas conforme a coluna "decidido".
Mudar alguma decisão depois mexe só nas constantes indicadas, não na
arquitetura.

| # | decisão | decidido | por quem | notas e custo |
|---|---|---|---|---|
| D1 | **Quem são os dois avaliadores** | **PENDENTE** | usuário | Não bloqueia código. Bloqueia os passos 5 e 6 do controlador e o pré-registro (Tarefa 8), que só registra os códigos `A` e `B` depois que o usuário disser quem são. Recomendação mantida: duas pessoas da equipe que usam o app para achar licitação e **não** construíram nem calibraram a busca. Com um avaliador só, a ADR não é cumprida e o gate fica reprovado por construção. |
| D2 | **Onde se julga** | **Página HTML local, autocontida**, uma por avaliador | usuário | Abre offline, sem servidor. Atalhos 0–3. Cada avaliador tem a própria ordem embaralhada. Nenhum indício de origem. O progresso fica em `localStorage`, salvo a cada julgamento, e retoma ao reabrir. Dá para exportar JSON a qualquer momento, e a página alerta quando há julgamentos não exportados. A importação valida o JSON com rigor (Tarefas 4 e 5). O consenso usa a mesma página, em modo consenso. |
| D3 | **Contra qual lexical o gate compara** | **`lexical_rank`**: os acertos lexicais ordenados por `ts_rank`, obtidos com `peso_vetorial = 0` numa janela curta | controlador | O `lexical_producao`, ordenado por prazo como a tela mostra hoje, entra no pool e no relatório **só como informativo**. |
| D4 | **Métrica primária** | **NDCG@10**, pré-registrada antes do primeiro julgamento. MRR sai no relatório | controlador | A ADR diz "NDCG@10 **ou** MRR". Escolher depois de ver os números seria escolher a que passou. |
| D5 | **Quantas consultas** | **130**: exatamente **100 no final** e **30 no ajuste**, sorteadas por hash | usuário | O validador exige ≥ 100 no final. |
| D6 | **Exigir significância** | **Sim**: ganho ≥ 10% **e** limite inferior do IC 95% (bootstrap pareado) do ganho relativo **> 0** | usuário | É **emenda ao critério 3 da ADR**, registrada no pré-registro (Tarefa 8). Constante `CRITERIOS.exigir_ic_positivo = true`. |
| D7 | **Empate num segmento crítico** | Δ NDCG@10 médio **≥ −0,02**. Segmento crítico com **< 10** consultas no final reprova | controlador | Constantes `tolerancia_segmento` e `minimo_por_segmento`. |
| D8 | **De onde vêm as consultas** | **Um agente rascunha e a equipe edita** (Tarefa 9). O agente **não lê o catálogo** | usuário | Risco inverso declarado abaixo. Salvaguarda: toda consulta nasce `rascunho`. O validador só aceita, no conjunto final, consulta com revisão humana registrada e ainda válida. |
| D9 | **LLM no julgamento** | **Nenhum.** Nem juiz, nem pré-triagem, nem sugestão visível | controlador | Veja "LLM neste gate" abaixo. |

### LLM neste gate (D8 e D9)

- **No julgamento: nenhum.** A ADR exige dois humanos. Uma pré-triagem que
  retirasse candidatos transformaria esses candidatos em "não julgados", que
  contam como nota 0. Os erros do LLM não seriam aleatórios: modelos de
  linguagem e o `bge-m3` compartilham noção de semelhança semântica, então os
  erros tenderiam a cair nos candidatos vindos do vetor. Uma sugestão de nota
  visível ancoraria o avaliador.
- **Na redação das consultas (D8), o risco é o inverso do que motivou não ler
  o catálogo.** Derivar consultas do texto do catálogo favorece o lexical. Um
  LLM redigindo "em linguagem de quem compra" tende a produzir paráfrases e
  sinônimos, que é justamente onde o vetor ganha. E o LLM compartilha com o
  `bge-m3` a noção do que é "parecido", então pode escrever, sem perceber,
  consultas que o vetor resolve bem. O ganho medido pode inflar.
  Mitigações no plano:
  1. As cotas de `termo_exato`, `sigla` e dos filtros obrigam consultas em que
     o lexical deveria ganhar. A Tarefa 9 exige, além disso, consultas com
     números, códigos e nomes próprios.
  2. Toda consulta rascunhada nasce `rascunho` e carrega `origem:
     "rascunho_agente"`. Só entra no final com revisão humana registrada, e a
     revisão perde a validade se texto, tipos ou filtros mudarem depois.
  3. O relatório do gate mostra o ganho **separado por origem** (`equipe` ×
     `rascunho_agente` × `semente_catalogo`), como segmento informativo. Se o
     ganho vier só das consultas do agente, isso aparece no número.
  4. O agente não vê resultado de busca, não roda busca e não lê o catálogo.

## Contexto

O critério 3 da ADR-001 exige ganho de relevância ≥ 10% (NDCG@10 ou MRR) do
híbrido sobre o lexical, no conjunto final, sem regressão nos segmentos
críticos. Hoje ele tem **zero julgamentos**.
`docs/superpowers/specs/consultas-avaliacao.json` tem 12 consultas com
`julgamentos: []`, e `scripts/experimento-busca.mjs` diz "gate de relevância
NÃO CUMPRIDO" porque não há o que calcular.

O que a ADR exige e este plano entrega:

- ≥ 100 consultas com sinônimos, siglas, erros de digitação e filtros (UF,
  município, modalidade, faixa de valor);
- dois avaliadores, escala 0–3 (irrelevante, relacionado, relevante, ideal),
  **sem saber qual mecanismo produziu cada candidato**, e divergências
  resolvidas por consenso;
- consultas, julgamentos, catálogo, modelo e parâmetros congelados, com o
  conjunto de ajuste separado do final.

Fatos do código que moldam o desenho:

1. **O app impõe filtros que o harness não usa hoje.** `buscarLicitacoesFn`
   força `apenas_abertas: true`. A tela aplica `uf = "SP"` quando o usuário
   não escolhe (`UF_INICIAL`) e ordena por `data_limite_proposta asc`
   (→ `data_encerramento_proposta`). O harness atual chama só com
   `palavra_chave`.
2. **O lexical de produção não ordena por relevância.** `buscar_licitacoes`
   ordena pelo campo pedido, que por padrão é o prazo. O `ts_rank` só existe
   dentro de `buscar_licitacoes_hibrida`, no CTE `lexical`. Com
   `peso_vetorial = 0`, o `score_rrf` de cada item vira `peso_lexical / (60 +
   posição lexical)`, e os itens vindos só do vetor ficam com `score_rrf = 0`.
   Descartá-los dá o lexical por `ts_rank` **sem DDL**.
3. **O catálogo muda a cada 3 h** (tarefas `3AM Licitacao - incremental 3h` e
   `3AM Licitacao - reconciliacao diaria`), e `apenas_abertas` depende do
   relógio. Congelar sem DDL significa **congelar as rodadas**: capturar o
   top-10 de cada sistema com `p_agora` fixo, numa janela sem sincronização,
   guardando o texto de cada licitação como estava. O gate é calculado sobre
   essas rodadas, e o harness recusa o veredito se a configuração atual da
   busca divergir da avaliada.
4. `buscar_licitacoes_hibrida` devolve `trecho` e `origem_semantica` só no ramo
   híbrido. **Esses campos revelariam a origem** e não podem chegar à página
   do avaliador, nem no que ela mostra nem no que ela embute.
5. Termos com menos de `min_chars_semantico` (4) caracteres degradam para o
   lexical por prazo mesmo com a flag ligada ("TR"). Essas consultas ficam no
   conjunto, porque esse é o comportamento real.
6. As 12 consultas atuais foram semeadas pelo agente que construiu a busca, a
   partir do vocabulário do catálogo (spec §4[D]). Elas também precisam de
   revisão humana: entram como `origem: "semente_catalogo"`, `rascunho`.

## Objetivo

Depois deste plano, sobra só trabalho humano: revisar as consultas, julgar e
fazer o consenso. Com os julgamentos no lugar, `npm run experimento:busca`
calcula NDCG@10 e MRR do híbrido e das bases, a concordância entre avaliadores,
o IC 95% e os segmentos críticos, e diz com número se o gate passou. Sem
julgamentos, continua dizendo que não está cumprido.

## Global Constraints

- **Nenhuma tarefa liga `configuracao_busca.hibrido_ativo` nem muda
  `peso_vetorial`.** Os scripts **verificam** o estado e se recusam a capturar
  no estado errado. Quem muda é o controlador.
- **Nenhuma execução contra Ollama ou Supabase por subagente.** Subagentes
  escrevem código e rodam `npx tsc --noEmit`, `npm test` e os CLIs que só
  mexem em disco. `avaliacao:capturar` e `experimento:busca` são do
  controlador.
- **Sem DDL.** Nada é criado ou alterado em `supabase/migrations/` nem em
  `supabase/APLICAR-*.sql`. Ler tabela via PostgREST com a chave de serviço é
  permitido, como o harness já faz.
- **Nenhum LLM no julgamento** (D9). O único uso de LLM é o rascunho de
  consultas da Tarefa 9, sempre sujeito à revisão humana.
- Toda lógica com decisão fica em `scripts/lib/*.mjs`, pura (sem rede, sem
  disco), com teste vitest em `scripts/lib/*.test.mjs`, no padrão de
  `scripts/lib/estatistica.mjs`. Os CLIs em `scripts/avaliacao/*.mjs` só leem,
  chamam a rede e gravam. O `include` de `vitest.config.ts` já cobre
  `scripts/**/*.test.mjs`.
- Node puro, **sem dependência nova** no `package.json`. A página HTML não
  carrega nada de fora: sem CDN, sem fonte remota, sem `fetch`.
- Os campos atuais de `logs/experimento-busca-AAAA-MM-DD.json` não somem.
  `gates.relevancia` mantém `consultas_julgadas`, `minimo_adr`, `cumprido` e
  `observacao`.
- Cada tarefa acrescenta **só a sua** linha em `package.json` → `scripts`. Ao
  integrar tarefas feitas em paralelo, o controlador resolve à mão o conflito
  nesse bloco.
- Português em comentários, mensagens e na interface da página.
- `npx tsc --noEmit` e `npm test` limpos ao fim de cada tarefa.
- Commits só locais, sem push, e sem reescrever histórico publicado
  (`AGENTS.md`).

## Contratos de dados

Fixados aqui para que as tarefas possam correr em paralelo. Os arquivos ficam
em `docs/superpowers/specs/avaliacao/` (pasta nova), exceto o conjunto de
consultas, que continua no caminho atual.

**Hash canônico:** `sha256(canonico(x))`, onde `canonico` é `JSON.stringify`
com as chaves de objeto ordenadas recursivamente e os arrays na ordem em que
estão. Implementado em `scripts/lib/canonico.mjs` (Tarefa 1).

### C1 — `docs/superpowers/specs/consultas-avaliacao.json`, versão 2

```json
{
  "versao": 2,
  "semente_divisao": "adr001-gate3-v1",
  "quantidade_ajuste": 30,
  "congelado_em": null,
  "instrucoes": "…",
  "consultas": [
    {
      "id": "q001",
      "texto": "reforma de escola",
      "tipos": ["sinonimo"],
      "filtros": {},
      "origem": "semente_catalogo",
      "revisao": { "estado": "rascunho" },
      "nota": "sinonimo esperado: manutencao predial em unidade de ensino"
    },
    {
      "id": "q013",
      "texto": "recapeamento de via urbana",
      "tipos": ["sinonimo"],
      "filtros": { "municipio": "Campinas" },
      "origem": "rascunho_agente",
      "revisao": { "estado": "revisada", "revisor": "E1", "revisado_em": "2026-09-23", "conteudo_sha256": "…" },
      "conjunto": "final"
    }
  ]
}
```

- `id`: `q` seguido de 3 dígitos, único.
- `texto`: não vazio depois de `trim`.
- `tipos`: não vazio, subconjunto de `sinonimo`, `sigla`, `erro_digitacao`,
  `termo_exato`, `generico`.
- `filtros`: só as chaves `uf`, `municipio`, `modalidade`, `valor_min`,
  `valor_max`, `limite_de`, `limite_ate`, com valor string não vazia.
  `palavra_chave` e `apenas_abertas` são **proibidas**, porque vêm de `texto` e
  do app. `valor_min`/`valor_max` são numéricos ≥ 0, com `valor_min ≤
  valor_max` quando os dois existem. `limite_de`/`limite_ate` seguem
  `AAAA-MM-DD`.
- `origem`: `"equipe"`, `"rascunho_agente"` ou `"semente_catalogo"`.
- `revisao.estado`: `"rascunho"` ou `"revisada"`. Quando `"revisada"`, exige
  `revisor` (código curto, que **não pode** ser `agente`, `claude` nem `llm`,
  sem distinguir maiúsculas), `revisado_em` (`AAAA-MM-DD`) e
  `conteudo_sha256 = sha256Canonico({texto, tipos, filtros})` **da consulta
  atual**. Hash diferente significa que a consulta foi editada depois da
  revisão, e ela volta a contar como rascunho.
- `conjunto`: `"ajuste"`, `"final"` ou ausente. Só `--atribuir` preenche.
- `nota`: opcional, livre.
- Hash de congelamento: `consultas_sha256 = sha256Canonico(consultas.map(c =>
  ({id, texto, tipos, filtros, conjunto, origem})))`. `revisao` e `nota` ficam
  fora do hash.

### C2 — `avaliacao/rodadas.json`

```json
{
  "versao": 1,
  "p_agora": "2026-09-22T13:00:00.000Z",
  "consultas_sha256": "…",
  "modelo": "bge-m3",
  "funcao_sql": { "arquivo": "supabase/migrations/20260920120000_limiar_exato_hibrida.sql", "sha256": "…" },
  "sistemas": {
    "lexical_producao": {
      "capturado_em": "…",
      "configuracao": { "hibrido_ativo": false, "peso_lexical": 1, "peso_vetorial": 1, "limiar_distancia": 0.4, "limiar_exato": 5000, "min_chars_semantico": 4, "modelo_esperado": "bge-m3" },
      "catalogo": { "licitacoes_total": 8792, "max_updated_at": "…" },
      "consultas": {
        "q001": { "ids": ["uuid", "…"], "modo": "lexical", "total": 37, "estrategia_vetorial": null, "elegiveis": null }
      }
    },
    "lexical_rank": { "…": "mesma forma" },
    "hibrido": { "…": "mesma forma" }
  },
  "licitacoes": {
    "uuid": { "id": "…", "numero_controle_pncp": "…", "objeto": "…", "orgao": "…", "unidade_nome": "…", "municipio": "…", "uf": "SP", "modalidade_nome": "…", "valor_total_estimado": 123.45, "data_publicacao": "…", "data_encerramento_proposta": "…", "url_pncp": "…", "link_sistema_origem": "…" }
  }
}
```

- `ids`: no máximo 10, na ordem devolvida pelo sistema.
- `licitacoes`: snapshot da **primeira** vez que o id apareceu, só com os 13
  campos acima. Nunca guarda `trecho`, `origem_semantica`, `score_rrf`,
  `score_aderencia`, `status_interno`, `prioridade` nem `observacoes`.

### C3 — `avaliacao/pool.json`

```json
{
  "versao": 1,
  "semente_instrumento": "adr001-gate3-instrumento-v1",
  "rodadas_sha256": "…",
  "consultas": { "q001": [ { "codigo": "c3fa91b0", "licitacao_id": "uuid" } ] }
}
```

- Por consulta, a **união deduplicada** dos `ids` de todos os sistemas
  presentes em `rodadas.sistemas`, **ordenada por `codigo`**. Nenhum campo diz
  de qual sistema cada item veio.
- `codigo = sha256(semente_instrumento + ":" + consulta_id + ":" +
  licitacao_id).slice(0, 8)`. Colisão dentro da mesma consulta é erro.
- `rodadas_sha256 = sha256Canonico(rodadas.sistemas)`, e `pool_sha256 =
  sha256Canonico(pool.consultas)`.

### C4 — Página do avaliador (`avaliacao/instrumento-<A|B>.html`)

Um único arquivo `.html`, com CSS e JS embutidos, que abre por `file://` sem
servidor. Os dados vão num `<script type="application/json"
id="dados-instrumento">` com esta forma, e **nada além dela**:

```json
{
  "formato": "gate3-instrumento",
  "versao": 1,
  "modo": "julgamento",
  "instrumento_id": "a1b2c3d4e5f6a7b8",
  "avaliador": "A",
  "pool_sha256": "…",
  "gerado_em": "…",
  "consultas": [
    {
      "consulta_id": "q047",
      "consulta": "pavimentação de estrada vicinal",
      "filtros": "UF: SP · Modalidade: Concorrência - Eletrônica · só abertas",
      "candidatos": [
        { "codigo": "c3fa91b0", "objeto": "…", "orgao": "…", "unidade": "…", "municipio_uf": "Itu/SP", "modalidade": "…", "valor_estimado": "R$ 1.234,56", "encerramento": "30/09/2026", "link": "https://…" }
      ]
    }
  ]
}
```

- `instrumento_id = sha256(pool_sha256 + ":" + avaliador + ":" +
  modo).slice(0, 16)`.
- A ordem de `consultas` e de `candidatos` já vem embaralhada para aquele
  avaliador. A página exibe na ordem do array.
- `licitacao_id` **não** vai para a página. O mapeamento `codigo →
  licitacao_id` fica só no `pool.json`.
- Proibido em qualquer nível, como chave ou valor: sistema, posição de
  ranking, score, `trecho`, `origem_semantica` e as palavras `lexical`,
  `hibrido`/`híbrido`, `vetor`, `semantic`. A regra vale também para o JS e o
  CSS embutidos (Tarefa 4, `verificarCegueira`).
- O contador "candidato 3 de 17" mostrado ao avaliador é a posição **na ordem
  embaralhada dele**, não no ranking de sistema nenhum.

### C5 — Exportação da página (`respostas-<A|B>-<AAAAMMDD-HHMM>.json`)

```json
{
  "formato": "gate3-respostas",
  "versao": 1,
  "modo": "julgamento",
  "instrumento_id": "a1b2c3d4e5f6a7b8",
  "avaliador": "A",
  "pool_sha256": "…",
  "exportado_em": "2026-09-24T18:02:11.000Z",
  "total_candidatos": 2340,
  "julgados": 1210,
  "notas": [
    { "consulta_id": "q047", "codigo": "c3fa91b0", "nota": 2, "observacao": "", "julgado_em": "…" }
  ]
}
```

No modo consenso, `formato` é `"gate3-consenso"`, `modo` é `"consenso"`,
`avaliador` é `"AB"`, e cada item de `notas` traz `nota_consenso` (0–3) e
`justificativa` no lugar de `nota` e `observacao`.

### C6 — `avaliacao/manifesto-instrumentos.json`

Gravado pelo gerador. É ele que a importação usa para validar.

```json
{
  "versao": 1,
  "pool_sha256": "…",
  "instrumentos": {
    "a1b2c3d4e5f6a7b8": { "arquivo": "instrumento-A.html", "avaliador": "A", "modo": "julgamento", "rodada": "principal", "pares": { "q047": ["c3fa91b0", "…"] } }
  }
}
```

### C7 — `avaliacao/julgamentos-brutos.json`

```json
{
  "versao": 1,
  "pool_sha256": "…",
  "avaliadores": {
    "A": { "importado_em": "…", "arquivo_sha256": "…", "instrumento_id": "…", "notas": { "q001": { "uuid": 2 } } },
    "B": { "…": "…" }
  }
}
```

### C8 — `avaliacao/julgamentos-consenso.json` (os qrels)

```json
{
  "versao": 1,
  "pool_sha256": "…",
  "gerado_em": "…",
  "avaliadores": ["A", "B"],
  "concordancia": {
    "kappa_ponderado_quadratico": { "geral": 0.71, "ajuste": 0.69, "final": 0.72 },
    "concordancia_exata": 0.64,
    "pares_total": 2340,
    "pares_divergentes": 842
  },
  "julgamentos": { "q001": { "uuid": 3 } }
}
```

## Tarefas

Dependências:

- 1 e 2 são independentes. A 2 importa `canonico.mjs` e `aleatorio.mjs` pelos
  nomes do contrato.
- 3 depende de 2.
- 4 depende de 1 e 2.
- 5 depende de 1 e 4.
- 6 depende de 1 e 2.
- 7 depende de 2, 3 e 6.
- 8 é documentação.
- 9 depende só do contrato C1 e pode começar junto com a 2.

---

## Tarefa 1 — Métricas de relevância, concordância e aleatoriedade reprodutível

**Arquivos (novos):** `scripts/lib/relevancia.mjs`,
`scripts/lib/relevancia.test.mjs`, `scripts/lib/aleatorio.mjs`,
`scripts/lib/aleatorio.test.mjs`, `scripts/lib/canonico.mjs`,
`scripts/lib/canonico.test.mjs`.

### `scripts/lib/canonico.mjs`

- `canonico(valor)` → string: `JSON.stringify` com as chaves ordenadas em
  todos os níveis. Arrays preservam a ordem.
- `sha256Canonico(valor)` → hex de `sha256(canonico(valor))`, via
  `node:crypto`.
- Testes:
  - `canonico({b:1,a:{d:2,c:3}}) === '{"a":{"c":3,"d":2},"b":1}'`;
  - chaves em ordens diferentes dão o mesmo hash;
  - arrays em ordens diferentes dão hashes diferentes.

### `scripts/lib/aleatorio.mjs`

- `mulberry32(semente)` → `() => número em [0, 1)`, **exatamente**:

  ```js
  export function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  ```

- `sementeDeTexto(texto)` → `parseInt(sha256(texto).slice(0, 8), 16)`.
- `embaralhar(lista, rng)` → cópia embaralhada por Fisher–Yates, de trás para
  a frente, com `j = Math.floor(rng() * (i + 1))`. Não altera a entrada.
- `uniformeDeTexto(texto)` → `sementeDeTexto(texto) / 2 ** 32`.
- Testes (valores conferidos com a implementação de referência):
  - `mulberry32(1)` produz `0.6270739406`, `0.0027357212`, `0.5274470400`
    (comparar com `toBeCloseTo(x, 9)`);
  - `sementeDeTexto("adr001") === 4241387509`;
  - `embaralhar([0,1,2,3,4,5,6,7,8,9], mulberry32(42))` dá
    `[0,7,3,5,2,1,8,9,4,6]`, e a original continua `[0..9]`;
  - `embaralhar([], rng)` dá `[]`.

### `scripts/lib/relevancia.mjs`

Convenções, documentadas no cabeçalho do módulo:

- **Nota e ganho:** nota ∈ {0,1,2,3}; ganho = `2^nota − 1` (0, 1, 3, 7);
  desconto `log2(posição + 1)`, com posição a partir de 1.
- **IDCG@k:** vem das notas de **todos** os candidatos julgados da consulta
  (o pool inteiro), não só da lista do sistema.
- **Não julgado:** política `"zero"` (padrão: vale nota 0 e fica na posição)
  ou `"condensado"` (sai da lista e as posições sobem). As funções devolvem
  também quantos não julgados encontraram.
- **IDCG = 0:** NDCG vira `null`. A consulta sai da média e é contada à parte.
- **RR:** `1/posição` do primeiro item com nota ≥ `limiar` (padrão 2) no
  top-k; 0 se não houver nenhum; `null` se o pool da consulta não tem nenhum
  item com nota ≥ `limiar`.

Funções exportadas:

- `dcg(notas, k = 10)`.
- `ndcg(ids, julgamentosDaConsulta, { k = 10, naoJulgado = "zero" } = {})` →
  `{ valor, nao_julgados }`.
- `reciprocalRank(ids, julgamentosDaConsulta, { k = 10, limiar = 2, naoJulgado = "zero" } = {})`
  → `{ valor, nao_julgados }`.
- `mediaDefinida(valores)`: ignora `null`; sem nenhum valor definido, devolve
  `null`.
- `ganhoRelativo(base, candidato)` → `(candidato − base) / base`; com
  `base === 0` ou `null`, devolve `null`.
- `kappaPonderado(notasA, notasB, { categorias = 4 } = {})`: Cohen com pesos
  quadráticos `w_ij = (i − j)² / (categorias − 1)²`, `κ = 1 − Σ w·O / Σ w·E`,
  `E_ij = linhaA_i · colunaB_j / n`. Tamanhos diferentes lançam erro; Σ w·E = 0
  devolve `null`.
- `concordanciaExata(notasA, notasB)`: fração de pares iguais.
- `bootstrapPareado(pares, estatistica, { reamostragens = 10000, semente = 20260921 } = {})`
  → `{ inferior, superior, estimativa }`. Cada reamostragem sorteia
  `pares.length` índices com reposição, via `mulberry32(semente)`. Nulos são
  descartados. O IC usa os percentis 2,5 e 97,5 de `percentil`, de
  `./estatistica.mjs`, e `estimativa = estatistica(pares)`.

Testes (valores conferíveis à mão; `toBeCloseTo(x, 5)`):

- **NDCG, lista completa:** julgamentos `{a:3, b:2, c:0, d:1}`, lista
  `["b","a","c","d"]`.
  - DCG = 3/1 + 7/log2(3) + 0 + 1/log2(5) = **7,847185**
  - IDCG = 7 + 3/log2(3) + 1/2 = **9,392789**
  - NDCG = **0,835448**
- **Lista ideal:** `["a","b","d"]` → **1**.
- **Não julgado:** `["x","a"]`. Com `"zero"`, **0,470202** e
  `nao_julgados = 1`; com `"condensado"`, **0,745253**.
- **Casos de borda:** todas as notas 0 → `null`; lista vazia com IDCG > 0 →
  **0**; um item nota 3 na posição 11 não muda o valor com `k = 10`.
- **RR:** `["c","d","b"]` → **1/3**; `["c","d"]` → **0**; pool sem nota ≥ 2 →
  `null`.
- **Kappa:**
  - `[0,1,2,3]` × `[0,1,2,3]` → **1**;
  - `[0,1,2,3]` × `[3,2,1,0]` → **−1**;
  - `[0,0,1,1,2,2,3,3]` × `[0,1,1,2,2,3,3,3]` → **0,85**. A conta vai no
    comentário: três discordâncias de 1 grau pesam 3/9; o esperado dá 20/9
    (marginais A = [2,2,2,2], B = [1,2,2,3]); κ = 1 − 3/20;
  - `[0,1,2,3,3,2]` × `[0,1,2,2,3,1]` → **0,846154**;
  - `[2,2,2]` × `[2,2,2]` → `null`.
- **Ganho relativo:** `ganhoRelativo(0.5, 0.55)` ≈ **0,10**;
  `ganhoRelativo(0, 0.3)` → `null`.
- **Bootstrap:**
  - pares todos iguais → `inferior === superior === estimativa`;
  - mesma semente → mesmo resultado;
  - `inferior ≤ estimativa ≤ superior` em 50 valores fixos.

**Verificação:** `npx tsc --noEmit` e `npm test` limpos.

---

## Tarefa 2 — Conjunto de consultas v2, revisão humana, segmentos, divisão e validador

**Arquivos:**

- novos: `scripts/lib/conjunto-avaliacao.mjs`,
  `scripts/lib/conjunto-avaliacao.test.mjs`,
  `scripts/avaliacao/validar-consultas.mjs`;
- migrado: `docs/superpowers/specs/consultas-avaliacao.json` (para v2);
- `package.json`: linha `"avaliacao:validar": "node scripts/avaliacao/validar-consultas.mjs"`.

### `scripts/lib/conjunto-avaliacao.mjs`

Constantes:

```js
export const UF_PADRAO = "SP";            // UF_INICIAL de src/routes/licitacoes.index.tsx
export const MIN_CHARS_SEMANTICO = 4;     // default de configuracao_busca.min_chars_semantico
export const TIPOS = ["sinonimo", "sigla", "erro_digitacao", "termo_exato", "generico"];
export const ORIGENS = ["equipe", "rascunho_agente", "semente_catalogo"];
export const REVISORES_PROIBIDOS = /^(agente|claude|llm)$/i;
export const CHAVES_FILTRO = ["uf", "municipio", "modalidade", "valor_min", "valor_max", "limite_de", "limite_ate"];
export const SEGMENTOS_CRITICOS = ["termo_exato", "sigla", "erro_digitacao",
  "filtro_municipio", "filtro_modalidade", "filtro_valor", "filtro_combinado"];
export const COTAS_FINAL = {
  total: 100, sinonimo: 15, termo_exato: 15, sigla: 10, erro_digitacao: 10,
  filtro_municipio: 10, filtro_modalidade: 10, filtro_valor: 10, filtro_combinado: 10,
  sem_filtro: 30,
};
```

Funções:

- **`validarConjunto(json)`** → `{ erros: string[], avisos: string[] }`.
  Aplica todas as regras do C1, com mensagens que citam o `id`. Duas regras
  são específicas desta tarefa:
  - consulta com `conjunto: "final"` que **não esteja revisada e válida** é
    **erro**: "q047: no conjunto final sem revisão humana registrada";
  - revisão com `conteudo_sha256` diferente do conteúdo atual é **erro**:
    "q047: editada depois da revisão; revisar de novo".
- **`revisaoValida(consulta)`** → boolean: estado `revisada`, revisor
  presente e não proibido, data válida e hash batendo com o conteúdo atual.
- **`marcarRevisadas(json, ids, revisor, data)`** → novo JSON. Cada id listado
  recebe `revisao` com o `conteudo_sha256` atual. Revisor proibido ou id
  inexistente lançam erro. Esta função **registra** uma revisão que um humano
  fez; o CLI que a chama existe para ser rodado pelo controlador depois que o
  revisor confirma (passo 2 do controlador).
- **`filtrosDaConsulta(consulta)`** → o `p_filtros` que o **app** mandaria:
  `{ ...consulta.filtros, palavra_chave: consulta.texto.trim(), uf:
  consulta.filtros.uf ?? UF_PADRAO, apenas_abertas: true }`. Um comentário
  aponta `buscarLicitacoesFn` e `filtrosDaBusca` como origem da regra.
- **`segmentosDaConsulta(consulta)`** → lista ordenada com:
  - cada `tipo`;
  - `filtro_uf` (UF explícita), `filtro_municipio`, `filtro_modalidade`,
    `filtro_valor` (`valor_min` ou `valor_max`) e `filtro_prazo`
    (`limite_de` ou `limite_ate`);
  - `filtro_combinado`, quando há ≥ 2 **grupos** entre UF, município,
    modalidade, valor e prazo;
  - `sem_filtro`, quando não há nenhum filtro;
  - `curta`, quando `texto.trim().length < MIN_CHARS_SEMANTICO`;
  - `origem_<origem>` (informativo).
- **`atribuirConjuntos(json, { refazer = false } = {})`** → novo JSON.
  - Ordena **todas** as consultas por
    `uniformeDeTexto(semente_divisao + ":" + id)`. As `quantidade_ajuste`
    primeiras vão para `"ajuste"` e o resto para `"final"`. Com 130
    consultas, dá exatamente 30 e 100.
  - Sem `refazer`, recusa quando alguma consulta já tem `conjunto`.
  - Com `congelado_em` preenchido, recusa sempre.
  - O resultado não depende da ordem das consultas no arquivo.
- **`conferirCotas(json)`** → `{ cumpridas, faltas: [{ segmento, tem,
  precisa }] }`, contando só `conjunto === "final"`.
- **`hashConsultas(json)`** → o `consultas_sha256` do C1.
- **`resumoRevisao(json)`** → contagem por `origem` × `revisao.estado`
  (`rascunho`, `revisada`, `invalidada`).

Testes:

- consulta válida mínima passa;
- cada regra do C1 tem um caso que falha citando o id: id duplicado, `tipos`
  vazio, tipo desconhecido, chave de filtro desconhecida, `palavra_chave`,
  `apenas_abertas`, `valor_min > valor_max`, data inválida, `conjunto`
  inválido, `origem` inválida;
- **revisão:**
  - `rascunho` no final → erro;
  - `revisada` no final → passa;
  - editar `texto` depois de `marcarRevisadas` → erro "editada depois da
    revisão";
  - editar só `nota` → continua válida;
  - `marcarRevisadas(..., "Claude", ...)` lança erro;
  - `rascunho` no ajuste → só aviso;
- `filtrosDaConsulta`: sem UF → `"SP"`; com `"RJ"` → `"RJ"`; sempre
  `apenas_abertas: true`; `palavra_chave` aparada;
- `segmentosDaConsulta`: `{texto:"TR", tipos:["sigla"], filtros:{},
  origem:"equipe"}` → `["curta","origem_equipe","sem_filtro","sigla"]`;
  `valor_min` com `valor_max` é **um** grupo só; município com `valor_max`
  gera `filtro_combinado`;
- `atribuirConjuntos`: com 130 consultas sintéticas dá exatamente 30/100;
  embaralhar a ordem do array dá a mesma atribuição; recusa sem `refazer`
  quando já atribuído; recusa sempre quando congelado;
- `hashConsultas` não muda com `nota`, `instrucoes` ou `revisao`, e muda com
  `texto`, `filtros`, `tipos`, `conjunto` e `origem`;
- `conferirCotas`: 100 finais `generico` sem filtro acusam as faltas esperadas.

### `scripts/avaliacao/validar-consultas.mjs` (só disco)

- Sem argumentos: imprime erros, avisos, `resumoRevisao`, contagem por
  conjunto e por segmento e as faltas de cota. Sai com código 1 se houver
  erro.
- `--atribuir [--refazer]`: aplica `atribuirConjuntos` e regrava o arquivo.
- `--marcar-revisadas=q013,q014 --revisor=E1`: aplica `marcarRevisadas` com a
  data de hoje e imprime quantas foram marcadas.
- `--congelar`: exige zero erros, cotas cumpridas e **nenhuma consulta sem
  revisão válida em nenhum dos dois conjuntos**. É mais estrito que o mínimo,
  porque consulta ruim no ajuste também estraga o ajuste. Grava
  `congelado_em` e imprime `consultas_sha256`.

### Migração para v2

Reescrever `docs/superpowers/specs/consultas-avaliacao.json` com:

- `versao: 2`, `semente_divisao: "adr001-gate3-v1"`, `quantidade_ajuste: 30`,
  `congelado_em: null`;
- `instrucoes` que apontam o guia da Tarefa 8 e dizem que os julgamentos
  agora ficam em `avaliacao/`;
- sem o campo `julgamentos`;
- as 12 consultas atuais com `filtros: {}`, `origem: "semente_catalogo"`,
  `revisao: {"estado":"rascunho"}`, `nota` preservada, sem `conjunto`, e os
  `tipos` abaixo.

| id | tipos |
|---|---|
| q001 reforma de escola | `sinonimo` |
| q002 pavimentacao asfaltica | `erro_digitacao` |
| q003 pavimentação asfáltica | `termo_exato` |
| q004 aquisicao de medicamentos | `erro_digitacao` |
| q005 coleta de lixo urbano | `sinonimo` |
| q006 merenda escolar | `generico` |
| q007 software de gestao | `generico` |
| q008 obra de drenagem | `generico` |
| q009 locacao de veiculos | `erro_digitacao` |
| q010 servicos de vigilancia patrimonial | `sinonimo` |
| q011 TR | `sigla` |
| q012 reforma ou ampliacao | `generico` |

**Atenção para a Tarefa 7:** até ela entrar, o harness lê
`consulta.julgamentos`. O `?? []` que ele já usa evita a quebra.

**Verificação:** `npx tsc --noEmit` e `npm test` limpos. `npm run
avaliacao:validar` sobre o arquivo migrado roda sem erro e mostra as faltas de
cota esperadas (só mexe em disco, então o subagente pode rodar).

---

## Tarefa 3 — Captura congelada das rodadas (código delegável, execução do controlador)

**Arquivos:**

- novos: `scripts/lib/rodadas.mjs`, `scripts/lib/rodadas.test.mjs`,
  `scripts/lib/supabase-rest.mjs`, `scripts/avaliacao/capturar-rodadas.mjs`;
- `package.json`: linha `"avaliacao:capturar": "node scripts/avaliacao/capturar-rodadas.mjs"`.

### `scripts/lib/supabase-rest.mjs` (fino, sem teste de rede)

- `carregarEnv()`: a mesma leitura de `.env` do harness.
- `rpc(nome, args)` e `embutir(texto)`: copiados do harness, com o mesmo
  comportamento de erro.
- `lerConfiguracaoBusca()` → `GET /rest/v1/configuracao_busca?id=eq.1&select=*`;
  devolve a primeira linha ou `null`.
- `impressaoCatalogo()` → `{ licitacoes_total, max_updated_at }`, obtido com
  `HEAD /rest/v1/licitacoes?select=id` e `Prefer: count=exact` (lendo
  `content-range`), mais
  `GET /rest/v1/licitacoes?select=updated_at&order=updated_at.desc&limit=1`.

### `scripts/lib/rodadas.mjs` (puro, testado)

- `SISTEMAS = ["lexical_producao", "lexical_rank", "hibrido"]`, e
  `CAMPOS_SNAPSHOT` com os 13 campos do C2.
- **`precondicoes(sistema, configuracao)`** → `{ ok, motivo }`:
  - `lexical_producao`: sempre ok;
  - `lexical_rank`: exige `hibrido_ativo === true` **e** `Number(peso_vetorial) === 0`;
  - `hibrido`: exige `hibrido_ativo === true` **e** `Number(peso_vetorial) > 0`;
  - configuração `null`: não ok.
- **`argumentosRpc(sistema, consulta, { p_agora, embedding })`** →
  `{ nome, args }`:
  - `lexical_producao`: `buscar_licitacoes` com
    `p_filtros: filtrosDaConsulta(consulta)`,
    `p_ordenar: "data_encerramento_proposta"`, `p_direcao: "asc"`,
    `p_limite: 10` e `p_agora`;
  - `lexical_rank` e `hibrido`: `buscar_licitacoes_hibrida` com os mesmos
    `p_filtros`, `p_embedding`, `p_limite: 10` e `p_agora`.
- **`extrairTop10(sistema, resposta, consulta, configuracao)`** →
  `{ ids, modo, total, estrategia_vetorial, elegiveis, alerta }`:
  - `lexical_rank` com `modo === "hibrido"`: só os itens com
    `Number(score_rrf) > 0`, na ordem recebida;
  - `lexical_rank` com `modo === "lexical"` (termo curto): os itens como
    vieram;
  - `hibrido` com `modo !== "hibrido"` e termo com pelo menos
    `min_chars_semantico` caracteres: `alerta` "degradou para lexical sem
    termo curto";
  - no máximo 10 ids.
- **`snapshotLicitacao(item)`** → só os `CAMPOS_SNAPSHOT`.
- **`mesclarRodada(rodadasAtual, sistema, capturada, { substituir })`**: lança
  erro se `consultas_sha256`, `p_agora` ou `catalogo` divergirem das capturas
  anteriores, ou se o sistema já existir sem `substituir`. Snapshots que já
  existem não são sobrescritos.

Testes:

- cada ramo de `precondicoes`;
- `argumentosRpc` para os três sistemas;
- `extrairTop10` com 12 itens sintéticos, 3 deles com `score_rrf` 0; o caso
  de termo curto; o alerta de degradação;
- `snapshotLicitacao` descarta `trecho`, `origem_semantica`, `score_rrf` e
  `score_aderencia`;
- cada erro de `mesclarRodada`.

### `scripts/avaliacao/capturar-rodadas.mjs`

`npm run avaliacao:capturar -- --sistema=<lexical_producao|lexical_rank|hibrido> [--substituir]`

1. Recusa se o conjunto de consultas não estiver congelado.
2. Aplica `precondicoes`. Se falhar, imprime o `update` SQL que o controlador
   precisa rodar.
3. Usa o `p_agora` de `rodadas.json`, se existir; senão, o instante atual.
4. Aquece o Ollama.
5. Para cada consulta: embedding (se o sistema usar), RPC e `extrairTop10`. Se
   aparecer o alerta de degradação, aborta sem gravar.
6. Lê `impressaoCatalogo()` antes e depois do laço. Se mudou, aborta: "o
   catálogo mudou durante a captura: pause as tarefas agendadas".
7. Aplica `mesclarRodada` e grava `rodadas.json`, com `funcao_sql.sha256`.
8. Imprime as consultas com zero resultados e, no `hibrido`, a contagem de
   `estrategia_vetorial`.

**Verificação:** `npx tsc --noEmit` e `npm test` limpos. **Não executar** o CLI.

---

## Tarefa 4 — Pool deduplicado e página cega do avaliador

**Arquivos:**

- novos: `scripts/lib/instrumento.mjs`, `scripts/lib/instrumento.test.mjs`,
  `scripts/lib/estado-julgamento.mjs`, `scripts/lib/estado-julgamento.test.mjs`,
  `scripts/avaliacao/pagina-instrumento.html` (modelo),
  `scripts/avaliacao/gerar-instrumento.mjs`;
- `package.json`: linha `"avaliacao:instrumento": "node scripts/avaliacao/gerar-instrumento.mjs"`.

### `scripts/lib/instrumento.mjs` (puro)

- **`montarPool(rodadas, { semente_instrumento, excluir })`** → contrato C3.
  `excluir` é `{ consulta_id: Set<licitacao_id> }`.
- **`ordemDoAvaliador(pool, avaliador, semente)`**: embaralha as consultas com
  `mulberry32(sementeDeTexto(semente + ":" + avaliador))` e os candidatos de
  cada consulta com `mulberry32(sementeDeTexto(semente + ":" + avaliador +
  ":" + consulta_id))`. Candidatos da mesma consulta ficam juntos.
- **`dadosDaPagina({ ordem, consultas, licitacoes, pool_sha256, avaliador,
  modo, notasDivergentes })`** → o objeto do C4.
  - Campos exibidos a partir do snapshot: `valor_estimado` como
    `R$ 1.234,56`, via `Intl.NumberFormat("pt-BR", {style:"currency",
    currency:"BRL"})`, trocando o U+00A0 por espaço comum; `encerramento` em
    `dd/mm/aaaa`; `link` = `url_pncp`, senão `link_sistema_origem`, senão
    vazio.
  - No modo `consenso`, cada candidato leva também `nota_A` e `nota_B`, e
    entram só os pares divergentes, ordenados por `consulta_id` e `codigo`.
- **`filtrosLegiveis(p_filtros)`**:
  `{uf:"SP", municipio:"Campinas", valor_max:"500000", apenas_abertas:true, palavra_chave:"x"}`
  → `"UF: SP · Município: Campinas · Valor: até R$ 500.000,00 · só abertas"`.
- **`verificarCegueira(dados, htmlCompleto)`**: lança erro se:
  - alguma chave, em qualquer nível de `dados`, não estiver na lista
    permitida do C4 (mais `nota_A`/`nota_B` no modo consenso);
  - `htmlCompleto` casar
    `/trecho|origem_semantica|score|lexical|h[ií]brid|vetor|semantic|posicao_rank|sistema/i`.
    A regra alcança o JS e o CSS do modelo, então os nomes internos da página
    têm de evitar essas palavras;
  - algum valor de `dados` tiver formato de UUID (sinal de `licitacao_id`
    vazando).
- **`montarHtml(modelo, dados, codigoEstado)`**: substitui no modelo os
  marcadores `/*__ESTADO__*/` (código de `estado-julgamento.mjs` com `export `
  removido do começo das linhas) e `__DADOS__` (JSON dos dados, com `<`
  escapado como `<`, para que um `objeto` contendo `</script>` não quebre
  a página).

### `scripts/lib/estado-julgamento.mjs` (puro, **sem imports**)

É a lógica que roda **dentro da página**: sem imports e sem DOM, testável no
vitest e embutida pelo gerador.

- `chaveArmazenamento(instrumento_id)` → `"gate3:" + instrumento_id`.
- `estadoInicial(dados)` → `{ instrumento_id, avaliador, modo, notas: {},
  alteracoes: 0, alteracoes_exportadas: 0, exportado_em: null, cursor: 0 }`.
- `restaurar(dados, textoSalvo)` → estado. Texto inválido, ou com
  `instrumento_id` diferente, devolve `estadoInicial` mais o aviso
  `"progresso salvo ignorado: pertence a outro instrumento"`. Códigos salvos
  que não existem nos dados são descartados.
- `registrarNota(estado, codigoConsulta, codigo, nota, agora)`: nota tem de
  ser inteiro de 0 a 3, senão lança erro. Grava `julgado_em` e incrementa
  `alteracoes`. `limparNota` também conta como alteração.
- `registrarObservacao(...)`: idem, no modo consenso para `justificativa`.
- `primeiroPendente(dados, estado)` → índice linear do primeiro candidato sem
  nota, ou `-1`. É isso que faz "retomar de onde parou".
- `naoExportados(estado)` → `alteracoes - alteracoes_exportadas`.
- `progresso(dados, estado)` → `{ julgados, total }`.
- `exportar(dados, estado, agora)` → `{ json, estado }`: devolve o objeto do
  C5 e o estado com `alteracoes_exportadas = alteracoes` e `exportado_em`.
- `mesclarImportado(dados, estado, textoJson)` → estado. Recupera o progresso
  a partir de um JSON exportado (troca de navegador, `localStorage` apagado).
  Recusa `instrumento_id` diferente. Por par, fica o `julgado_em` mais
  recente.

Testes:

- ida e volta `exportar` → `mesclarImportado` sem perda;
- `restaurar` com JSON corrompido, com outro `instrumento_id` e com código
  desconhecido;
- `registrarNota` recusa `4`, `2.5`, `"2"` e `-1`;
- `primeiroPendente` depois de julgar os 3 primeiros de 5 → `3`; com tudo
  julgado → `-1`;
- `naoExportados`: 0 depois de exportar, 1 depois de mais um julgamento, e
  sobe também com `limparNota`;
- o módulo não tem `import` nem referência a `window`/`document` (o teste lê o
  próprio arquivo).

### `scripts/avaliacao/pagina-instrumento.html` (modelo)

HTML único, com CSS e JS embutidos. A cola de DOM é fina: toda decisão passa
pelas funções de `estado-julgamento.mjs`.

- **Cabeçalho:** `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:">`.
  Nenhuma requisição de rede é possível; os links do PNCP abrem por
  navegação, com `target="_blank" rel="noopener noreferrer"`.
- **Tela:** um candidato por vez, com a consulta e os filtros no topo,
  depois os campos do C4, um campo de observação, a barra de progresso
  (`julgados / total`) e "candidato k de n desta consulta".
- **Atalhos:**

  | tecla | ação |
  |---|---|
  | `0`–`3` | dá a nota e avança |
  | `←` / `→` | anterior / próximo |
  | `P` | próximo pendente |
  | `Backspace` | limpa a nota |
  | `O` | abre o link |
  | `N` | foca a observação |
  | `E` | exporta |

  Os atalhos ficam desligados enquanto o foco está no campo de texto.
- **Persistência:**
  - `localStorage.setItem` a cada `registrarNota`, `limparNota` e
    observação, dentro de `try/catch`;
  - se a gravação falhar (armazenamento bloqueado ou cheio), aparece uma
    faixa vermelha fixa: "o progresso NÃO está sendo salvo neste navegador:
    exporte agora e a cada poucos minutos";
  - ao abrir, `restaurar` e vai para `primeiroPendente`, mostrando "retomado:
    k de N julgados".
- **Exportação:** botão "Exportar respostas" (e a tecla `E`) gera um `Blob` e
  baixa `respostas-<avaliador>-<AAAAMMDD-HHMM>.json` por `<a download>`.
- **Alertas de não exportado:**
  - contador fixo "N julgamentos não exportados" sempre que `naoExportados >
    0`, que fica âmbar a partir de 50;
  - `beforeunload` com aviso quando `naoExportados > 0`;
  - ao chegar a 100% julgado, um aviso modal pedindo a exportação final.
- **Recuperação:** botão "Carregar respostas exportadas" (`<input
  type="file">`) chama `mesclarImportado`.
- **Modo consenso:** mostra "Avaliador A: x · Avaliador B: y". As teclas
  `0`–`3` dão a `nota_consenso`, e a justificativa é obrigatória para
  avançar.

### `scripts/avaliacao/gerar-instrumento.mjs` (CLI, só disco)

`npm run avaliacao:instrumento -- [--avaliadores=A,B] [--calibracao=10] [--apenas-novos] [--consenso]`

- Recusa se o `consultas_sha256` de `rodadas.json` não bater com o arquivo de
  consultas.
- Grava `pool.json`, `instrumento-<avaliador>.html` e
  `manifesto-instrumentos.json` (C6). Chama `verificarCegueira` antes de cada
  gravação e aborta se falhar.
- `--calibracao=N`: `calibracao-<avaliador>.html` com as N primeiras
  consultas de ajuste por id, iguais para os dois e em ordens diferentes
  (`rodada: "calibracao"` no manifesto).
- `--apenas-novos`: exclui os pares já presentes em
  `julgamentos-consenso.json`.
- `--consenso`: lê `julgamentos-brutos.json`, exige A e B completos e gera
  `consenso.html` só com os divergentes.
- Imprime, por instrumento, as consultas, os pares, a média e o máximo por
  consulta e a estimativa a **9 s por julgamento**.

Testes de `instrumento.mjs`:

- `montarPool` deduplica, ordena por `codigo`, não traz campo de sistema e
  respeita `excluir`;
- trocar a ordem dos `ids` numa rodada não muda nenhum código;
- **cegueira por posição (estatístico, determinístico):** 1.000 consultas
  sintéticas com 10 ids "só da rodada X" seguidos de 10 "só da rodada Y". Para
  o avaliador A, a posição normalizada média (posição / 19) dos ids de Y na
  ordem final fica entre 0,45 e 0,55. Sem embaralhar, seria ~0,74;
- A e B recebem ordens diferentes, e cada um recebe a mesma ordem ao
  regenerar;
- `verificarCegueira` aceita os dados do C4 e rejeita: chave `score`, chave
  `trecho`, um UUID num valor e um HTML contendo `híbrido`;
- **página gerada de ponta a ponta** a partir de um pool sintético cujo
  snapshot tem `trecho` e `origem_semantica`: o HTML final não contém nenhum
  dos dois; contém exatamente um `id="dados-instrumento"`; o JSON embutido faz
  parse; e o JS embutido compila com `new Function(scriptExtraido)`;
- um `objeto` contendo `</script>` não quebra o bloco de dados;
- a string de `filtrosLegiveis` acima, comparada exatamente.

**Verificação:** `npx tsc --noEmit` e `npm test` limpos. O subagente pode rodar o
CLI com um `rodadas.json` sintético num diretório temporário, nunca contra o
banco. O teste manual no navegador é do controlador (passo 4).

---

## Tarefa 5 — Importação do JSON, concordância e consenso

**Arquivos:**

- novos: `scripts/lib/julgamentos.mjs`, `scripts/lib/julgamentos.test.mjs`,
  `scripts/avaliacao/importar-julgamentos.mjs`;
- `package.json`: linha `"avaliacao:importar": "node scripts/avaliacao/importar-julgamentos.mjs"`.

### `scripts/lib/julgamentos.mjs`

**`validarExportacao(json, manifesto, { modo })`** → `{ notas, erros,
faltando, instrumento }`. É o rigor que um CSV teria, e mais. Cada item
abaixo gera um **erro** com o índice do item em `notas`:

- `formato` diferente de `"gate3-respostas"` (ou de `"gate3-consenso"` no
  modo consenso), ou `versao` diferente de 1;
- `instrumento_id` ausente do manifesto, `avaliador` ou `modo` que não
  correspondem ao instrumento, ou `pool_sha256` diferente do manifesto;
- chave desconhecida no topo ou em um item;
- `notas` que não é array;
- par `(consulta_id, codigo)` fora de `manifesto.instrumentos[id].pares`;
- par duplicado;
- `nota` (ou `nota_consenso`) que não é **inteiro** 0–3 do tipo `number`:
  `"2"`, `2.5`, `null` e `4` são erro;
- `observacao`/`justificativa` que não é string, ou `justificativa` vazia no
  modo consenso;
- `julgados` ou `total_candidatos` divergindo do que o próprio arquivo e o
  manifesto contêm.

Pares do manifesto que não aparecem no arquivo contam em `faltando`. `notas`
sai mapeada para `{ qid: { licitacao_id: nota } }` pelo `pool`.

Demais funções:

- `pares(brutos)`: lista alinhada `[{ qid, licitacao_id, A, B }]`.
- `resumoConcordancia(pares, consultas)` → C8.`concordancia`, com o kappa de
  cada conjunto.
- `divergencias(pares)`: os pares em que `A !== B`.
- `aplicarConsenso(pares, notasConsenso)` → C8.`julgamentos`. Par concordante
  fica com a nota comum; divergente, com `nota_consenso`. Faltar algum
  divergente é erro.

Testes:

- cada erro de `validarExportacao` tem um caso próprio;
- arquivo válido com 3 faltando → `faltando: 3`, sem erro;
- o instrumento de A importado como B → erro;
- JSON de calibração importado como principal → erro;
- `resumoConcordancia` reproduz o κ = 0,85 da Tarefa 1;
- `aplicarConsenso` aceita `nota_consenso` diferente de A e de B, e recusa
  quando falta um par.

### `scripts/avaliacao/importar-julgamentos.mjs` (CLI, só disco)

- **`avaliador --arquivo=<json>`**: o avaliador vem do próprio arquivo e é
  conferido contra o manifesto. Grava em `julgamentos-brutos.json`, ou em
  `calibracao-brutos.json` quando o instrumento é de calibração. Com erro, sai
  com código 1 sem gravar. Com `faltando > 0`, grava e avisa "incompleto".
- **`divergencias [--calibracao]`**: exige A e B completos e com o
  `pool_sha256` atual. Imprime κ geral, de ajuste e de final e a concordância
  exata. Com κ < 0,60, alerta "concordância fraca: revisar o guia antes do
  consenso". Depois orienta a rodar `avaliacao:instrumento -- --consenso`.
- **`consenso --arquivo=<json>`**: valida no modo consenso e grava
  `julgamentos-consenso.json` (C8), com a concordância medida **antes** do
  consenso.

**Verificação:** `npx tsc --noEmit` e `npm test` limpos.

---

## Tarefa 6 — Cálculo do gate 3

**Arquivos (novos):** `scripts/lib/gate-relevancia.mjs`,
`scripts/lib/gate-relevancia.test.mjs`.

```js
export const CRITERIOS = {
  metrica_primaria: "ndcg@10",          // D4, pré-registrada
  sistema_base: "lexical_rank",         // D3
  sistema_candidato: "hibrido",
  sistemas_informativos: ["lexical_producao"],
  ganho_minimo: 0.10,                   // ADR-001, critério 3
  exigir_ic_positivo: true,             // D6, emenda à ADR
  minimo_consultas_final: 100,          // D5
  minimo_por_segmento: 10,              // D7
  tolerancia_segmento: -0.02,           // D7, delta absoluto de NDCG@10
  limiar_mrr: 2,
  reamostragens: 10000,
  semente_bootstrap: 20260921,
  limiar_regressao_consulta: -0.10,     // só relatório
  epsilon: 1e-9,
  chaves_configuracao: ["peso_lexical", "peso_vetorial", "limiar_distancia",
    "limiar_exato", "min_chars_semantico", "modelo_esperado"],
};
```

### `avaliarGate3({ consultas, rodadas, pool, qrels, configAtual, criterios = CRITERIOS })`

Devolve:

```js
{
  cumprido, observacao, motivos: [],
  consultas_julgadas, consultas_final, minimo_adr: 100,
  metrica_primaria, base, candidato,
  final: {
    ndcg10: { base, candidato, ganho_relativo, ic95: [inf, sup], consultas_avaliadas, excluidas_sem_relevante },
    mrr:    { base, candidato, ganho_relativo, ic95: [inf, sup], consultas_avaliadas, excluidas_sem_relevante },
  },
  informativo: { "<sistema>": { ndcg10, mrr }, ajuste: { ndcg10: { base, candidato, ganho_relativo } } },
  segmentos: [{ nome, critico, consultas, ndcg_base, ndcg_candidato, delta, ic95_delta, cumprido }],
  por_origem: [{ origem, consultas, ndcg_base, ndcg_candidato, ganho_relativo }],   // risco declarado em D8
  concordancia,
  pares_nao_julgados: { base, candidato },
  regressoes_por_consulta: [{ id, texto, delta }],
}
```

Regras. **Todas** são avaliadas e acumuladas em `motivos`:

1. `qrels === null` → `cumprido: false`, `consultas_julgadas: 0`, e
   `observacao` **exatamente** igual ao texto atual do harness: `"NAO
   CUMPRIDO: nenhum julgamento humano registrado. NDCG/MRR nao podem ser
   calculados e o gate 3 da ADR-001 continua aberto."`. Retorna sem calcular.
2. Menos de 2 avaliadores distintos em `qrels.avaliadores` → motivo.
3. Divergência entre `consultas_sha256`, `pool_sha256` e `rodadas_sha256` →
   motivo "conjunto alterado depois do congelamento".
4. Sistema base ou candidato ausente em `rodadas.sistemas` → motivo.
5. Menos de `minimo_consultas_final` consultas julgadas no final → motivo.
6. Algum id do top-10 da base ou do candidato, no final, sem nota → motivo "N
   pares sem julgamento". As métricas continuam saindo, com a política
   `"zero"`.
7. `configAtual` `null`, ou diferente de
   `rodadas.sistemas.hibrido.configuracao` em alguma das
   `chaves_configuracao` → motivo. `hibrido_ativo` fica fora da comparação.
8. Ganho da métrica primária `< ganho_minimo − epsilon`, ou `null` → motivo.
9. `exigir_ic_positivo` e `ic95[0] <= 0` → motivo "IC 95% do ganho inclui
   zero".
10. Segmento crítico no final com menos de `minimo_por_segmento` consultas →
    "segmento insuficiente"; com `delta < tolerancia_segmento − epsilon` →
    "regressão no segmento".

Com isso: `cumprido = motivos.length === 0`. `observacao` fica `"CUMPRIDO:
NDCG@10 <base> -> <candidato> (+x,x%, IC95 +a,a% a +b,b%) em N consultas"` ou
`"NAO CUMPRIDO: "` seguido dos motivos unidos por `"; "`. `por_origem` é só
informativo: não reprova, mas vai impresso (Tarefa 7).

**Cálculo:**

- NDCG@10 e RR por consulta, com política `"zero"`.
- Médias sobre as consultas em que base **e** candidato estão definidos.
- IC do ganho relativo via `bootstrapPareado` sobre `{ base, candidato }` por
  consulta.
- IC do delta de cada segmento com a mesma função, usando a estatística
  `média(candidato − base)`.

Testes:

- `qrels = null` → a observação exata da regra 1;
- **fixture aprovado:** 100 consultas finais revisadas, qrels `{y: 3, x: 1}`,
  base `["x","y"]`, candidato `["y","x"]`, com cada segmento crítico em 10
  consultas.
  - NDCG base = (1 + 7/log2 3) / (7 + 1/log2 3) = **0,709810**; candidato
    **1**; ganho **0,408828**.
  - IC degenerado em [0,408828; 0,408828] e `cumprido: true`.
- candidato pior nas 10 consultas `sigla` → "regressão no segmento sigla";
- 9 consultas `erro_digitacao` → "segmento insuficiente";
- 99 consultas finais → regra 5;
- id fora dos qrels → regra 6;
- `peso_vetorial` diferente → regra 7; só `hibrido_ativo` diferente → nenhum
  motivo;
- `texto` alterado depois da captura → regra 3;
- médias 0,5 e 0,55 → **passa** a regra 8;
- **IC inclui zero:** 100 consultas, metade com ganho grande e metade com
  perda de tamanho parecido, e ganho pontual ≥ 10%. O IC inferior sai ≤ 0 e o
  gate reprova **só** pela regra 9;
- pool todo com nota 0 → consulta em `excluidas_sem_relevante`;
- `por_origem` separa `equipe` e `rascunho_agente` corretamente;
- vários motivos ao mesmo tempo aparecem todos.

**Verificação:** `npx tsc --noEmit` e `npm test` limpos.

---

## Tarefa 7 — Integração no harness

**Arquivo:** `scripts/experimento-busca.mjs`. Depende das Tarefas 2, 3 e 6.

1. **Filtros do app:** usar `filtrosDaConsulta(consulta)` como `p_filtros` em
   **todas** as chamadas. A lexical recebe
   `p_ordenar: "data_encerramento_proposta"` e `p_direcao: "asc"`, como a
   tela.
2. **Repetições:** sem `EXPERIMENTO_REPETICOES`, usar
   `Math.max(1, Math.ceil(100 / consultas.length))`. Com 12 consultas dá 9;
   com 130 dá 1, o que troca 9 repetições quentes da mesma busca por tráfego
   variado. Comentário citando a seção da ADR sobre cache quente.
3. **Rede:** usar `rpc`, `embutir` e `lerConfiguracaoBusca` de
   `scripts/lib/supabase-rest.mjs`.
4. **Gate:** remover a leitura de `consulta.julgamentos`. Ler `rodadas.json`,
   `pool.json` e `julgamentos-consenso.json` quando existirem (ausência vira
   `null`) e a configuração atual, e gravar o resultado em
   `relatorio.gates.relevancia = avaliarGate3({...})`.
5. **Isenção do override "NAO MEDIDO":** o gate `relevancia` fica fora dele.
   Um comentário explica: o gate é calculado sobre rodadas congeladas, cujo
   modo foi verificado na captura, e a regra 7 é a proteção equivalente.
   `pode_ligar_hibrido` continua exigindo todos os gates.
6. **Deriva:** `relatorio.relevancia_deriva`, só com `modo_observado ===
   "hibrido"` e qrels presentes: fração dos ids do top-10 híbrido ao vivo sem
   julgamento, nas consultas finais. Acima de 0,30, imprimir "o conjunto
   julgado está envelhecendo".
7. **Terminal:** sem qrels, a observação atual, idêntica. Com qrels:
   - `CUMPRIDO` ou `NAO CUMPRIDO`;
   - as linhas de NDCG@10 e MRR com ganho e IC;
   - o kappa A × B;
   - cada motivo numa linha;
   - os segmentos críticos com delta, marcando os reprovados;
   - as linhas de `por_origem`.
8. **Cabeçalho:** atualizar o comentário do topo do harness.

**Verificação:** `npx tsc --noEmit` e `npm test` limpos. **Não executar**
`npm run experimento:busca`.

---

## Tarefa 8 — Guia dos avaliadores e pré-registro na ADR

**Arquivos:** `docs/superpowers/specs/avaliacao/guia-avaliadores.md` (novo),
`docs/architecture/adr-001-busca-vetorial.md`.

### Guia (linguagem de negócio)

- **A pergunta de cada candidato:** "esta licitação serve para quem fez esta
  busca, com estes filtros?". Julga-se a necessidade, não a presença das
  palavras.
- **Escala**, com dois exemplos reais por nota. O controlador escolhe os
  exemplos; o subagente deixa marcadores `<!-- EXEMPLO -->`.

  | nota | significado |
  |---|---|
  | 0 irrelevante | não serve |
  | 1 relacionado | mesmo assunto, mas não atende |
  | 2 relevante | atende em parte |
  | 3 ideal | é exatamente o que a busca procura |

- **Uso da página:**
  - abrir o arquivo `.html` com duplo clique, no **mesmo navegador** até o
    fim;
  - atalhos da Tarefa 4;
  - o progresso salva sozinho e retoma ao reabrir;
  - **exportar ao fim de cada sessão** e guardar o `.json` na pasta
    combinada;
  - se aparecer a faixa vermelha, exportar na hora;
  - "Carregar respostas exportadas" recupera o progresso em outro
    computador.
- **Regras:**
  - julgar sozinho;
  - não abrir nenhum outro arquivo do projeto;
  - abrir o link do PNCP quando o objeto não bastar para decidir;
  - na dúvida entre duas notas, a menor;
  - sessões de no máximo 1 h.
- **Etapas:** calibração (10 consultas) → conversa → instrumento principal →
  consenso na página de consenso, os dois juntos, com justificativa curta.
- **Seção para quem revisa as consultas (Tarefa 9):**
  - o que conferir: a consulta parece de quem compra? o tipo está certo? os
    filtros fazem sentido?
  - reescrever ou apagar à vontade;
  - não "melhorar" consulta para ela ficar mais fácil para algum mecanismo;
  - avisar o controlador de quais ids foram revisados, e por quem.

### ADR — nova seção "Protocolo do critério 3 (pré-registrado em AAAA-MM-DD)"

Registrar, **antes da primeira captura**:

- **Avaliadores:** códigos A e B. **Pendente de D1**: a seção só é commitada
  depois que o usuário disser quem são.
- **Meio de julgamento:** página HTML local.
- **Comparação:** base `lexical_rank`, candidato `hibrido`, `lexical_producao`
  informativo.
- **Métricas:** NDCG@10 com ganho `2^nota − 1` como primária; MRR com limiar
  2.
- **Conjuntos:** 130 consultas, exatamente 100 finais e 30 de ajuste.
- **Emenda ao critério 3 (D6):** "além do ganho ≥ 10%, o limite inferior do IC
  95% bootstrap pareado (10.000 reamostragens, semente 20260921) do ganho
  relativo tem de ser > 0". Escrito como emenda, com data e motivo.
- **Segmentos críticos:** a lista, mínimo de 10 por segmento e tolerância
  −0,02.
- **Não julgados:** contam como nota 0, e o gate exige zero não julgados no
  top-10 do final. Consultas sem nenhum relevante saem da média e são
  contadas.
- **Congelamento:** por rodadas com `p_agora` fixo.
- **Origem das consultas (D8):** rascunho por agente sem acesso ao catálogo,
  revisão humana obrigatória, risco de favorecimento do vetor declarado e
  ganho reportado por origem.
- **Uso do conjunto final:** passo 9 do controlador.

Atualizar a linha do critério 3 na tabela "Situação dos critérios".

**Verificação:** revisão de texto pelo controlador; `npm test` inalterado.

---

## Tarefa 9 — Rascunho das ~118 consultas (agente, sem catálogo)

**Arquivo:** `docs/superpowers/specs/consultas-avaliacao.json` (só acrescenta
consultas). Depende do formato C1; pode rodar antes da Tarefa 2 terminar, mas
o resultado só é validado depois dela.

### Restrições do redator (subagente)

- **Não ler o catálogo:**
  - nenhuma consulta ao banco;
  - nenhum arquivo em `logs/`;
  - nenhum `rodadas.json`;
  - nenhum dump, CSV ou JSON com licitações;
  - nenhuma execução de busca.

  Pode ler `src/lib/types.ts` (lista `MODALIDADES`), para que o filtro de
  modalidade use o nome exato que o banco compara, e este plano.
- Não ler `scripts/experimento-busca.mjs` nem o código da busca: o redator não
  deve saber o que cada mecanismo faz bem.
- Redigir a partir do **domínio de licitações de construção civil** (obras,
  reformas, manutenção predial, pavimentação, drenagem, saneamento, projetos
  e laudos de engenharia, fiscalização de obra, materiais de construção,
  locação de máquinas), **em linguagem de quem compra**: curta, como se
  digita num campo de busca, às vezes vaga, às vezes com jargão.

### Conteúdo exigido

- **Quantidade:** 118 consultas, ids `q013`…`q130`, cada uma com `origem:
  "rascunho_agente"`, `revisao: {"estado":"rascunho"}` e **sem** `conjunto`.
- **Cotas mínimas sobre as 118**, dimensionadas para que, depois do sorteio
  de 30 para ajuste, o final ainda cumpra `COTAS_FINAL` com folga (um mesmo
  item pode contar em mais de uma cota):

  | segmento | mínimo |
  |---|---|
  | `sinonimo` | 20 |
  | `termo_exato` | 22 |
  | `sigla` | 14 |
  | `erro_digitacao` | 14 |
  | `filtro_municipio` | 14 |
  | `filtro_modalidade` | 14 |
  | `filtro_valor` | 14 |
  | `filtro_combinado` | 14 |
  | `sem_filtro` | 40 |

- **`termo_exato` com contrapeso ao viés do redator:** pelo menos 10 com
  número, código ou nome próprio (p.ex. "NBR 9050", "CBUQ faixa C", nome de
  bairro ou de via, "tipo menor preço global"), porque é onde o lexical
  deveria ganhar.
- **`sigla`:** siglas do setor, como CBUQ, PPCI, SPDA, ART, BDI, EPI, CFTV,
  PMOC e SINAPI. Incluir algumas com menos de 4 letras (ART, BDI, EPI), que
  exercitam a degradação para o lexical.
- **`erro_digitacao`:** erros reais de digitação: sem acento, letra trocada,
  letra faltando, junção de palavras. Nada de erro artificial que ninguém
  cometeria.
- **Filtros:**
  - municípios reais de SP, variando capital, médios e pequenos;
  - `valor_min`/`valor_max` plausíveis para o objeto;
  - `modalidade` com o nome exato de `MODALIDADES`;
  - nenhum filtro de UF diferente de SP (o escopo da coleta é SP).
- **Contra duplicação:** nenhuma consulta pode ser paráfrase de outra, nem
  das 12 existentes.
- **Campo `nota` de cada consulta:** uma linha dizendo **que necessidade de
  compra** ela representa. É isso que o revisor confere.

### Verificação do redator

- `npm run avaliacao:validar` sem erros e com as cotas sobre as 130 listadas
  (as cotas do final só existem depois de `--atribuir`, que é do
  controlador);
- `npx tsc --noEmit` e `npm test` inalterados;
- **o redator não roda `--atribuir`, `--marcar-revisadas` nem `--congelar`.**

---

## Depois das tarefas (controlador, não delegável)

1. **Pendência D1.** Obter do usuário os dois avaliadores. Aplicar os códigos
   no guia e na ADR (Tarefa 8) e **commitar a ADR antes de qualquer
   captura**.
2. **Revisão das consultas (humano, ~2–3 h).** A equipe revisa as 130: as 118
   rascunhadas e as 12 semente. Edita, apaga ou reescreve à vontade;
   consultas apagadas são repostas por ela mesma ou por nova rodada da Tarefa
   9. Para cada lote que um revisor confirmar, o controlador roda `npm run
   avaliacao:validar -- --marcar-revisadas=<ids> --revisor=<código>`.
   **Nunca marcar como revisada uma consulta que nenhum humano leu.** Depois:
   - `-- --atribuir`;
   - se faltar cota no final, a equipe acrescenta consultas do segmento que
     falta e o controlador roda `-- --atribuir --refazer` (permitido porque
     nada foi julgado ainda);
   - `-- --congelar` e commit.
3. **Janela de captura (~10 min).**
   1. `select * from configuracao_busca where id = 1;` e anotar
      `peso_vetorial` (esperado `1.0`).
   2. `Disable-ScheduledTask -TaskName "3AM Licitacao - incremental 3h"` e
      `Disable-ScheduledTask -TaskName "3AM Licitacao - reconciliacao diaria"`.
      Confirmar que nenhuma das duas está rodando.
   3. `npm run avaliacao:capturar -- --sistema=lexical_producao`.
   4. `update public.configuracao_busca set hibrido_ativo = true, peso_vetorial = 0 where id = 1;`
      e depois `--sistema=lexical_rank`.
   5. `update public.configuracao_busca set peso_vetorial = <original> where id = 1;`
      e depois `--sistema=hibrido`.
   6. `update public.configuracao_busca set hibrido_ativo = false where id = 1;`
      e **conferir pelo banco**.
   7. Reativar as duas tarefas agendadas.
   8. Se algum passo abortar com "catálogo mudou", repetir a janela inteira
      com `--substituir`.

   Os `update` vão pelo SQL Editor ou por `PATCH
   /rest/v1/configuracao_busca?id=eq.1` com a chave de serviço; não são DDL.
4. **Páginas e teste de fumaça.** `npm run avaliacao:instrumento` e depois
   `-- --calibracao=10`. Antes de enviar, abrir `instrumento-A.html` por
   `file://` no navegador que o avaliador vai usar e conferir:
   1. atalhos 0–3;
   2. julgar 3 candidatos, fechar, reabrir e verificar que retoma no 4º;
   3. contador de não exportados;
   4. exportar;
   5. apagar o `localStorage`, reabrir, carregar o JSON e verificar que o
      progresso voltou;
   6. aviso ao fechar com pendência;
   7. "Exibir código-fonte" sem nenhuma palavra que indique origem.

   Apagar esse teste (limpar o armazenamento). Commitar `rodadas.json`,
   `pool.json`, o manifesto e os `.html` **antes** de enviar.
5. **Calibração (humano).** Os dois julgam `calibracao-*.html` e exportam.
   Importar os dois, rodar `divergencias --calibracao` e fazer uma conversa de
   30 min. Ajustar o guia se preciso. Esses julgamentos são descartados.
6. **Julgamento principal (humano).** Cada um julga e exporta ao fim de cada
   sessão; o controlador guarda o `.json` mais recente de cada um. Depois:
   - importar A e B e rodar `divergencias`;
   - com κ < 0,60, parar e revisar o guia com os dois;
   - `avaliacao:instrumento -- --consenso` e reunião de consenso na página;
   - `importar consenso --arquivo=…`;
   - commitar `julgamentos-brutos.json`, o JSON de consenso e
     `julgamentos-consenso.json`.
7. **Medição.** Ligar `hibrido_ativo` com o `peso_vetorial` original, rodar
   `npm run experimento:busca`, desligar a flag e conferir pelo banco.
8. **Registro.** Escrever na ADR o resultado do gate 3: NDCG@10, MRR, ganho,
   IC, κ, segmentos, motivos e o ganho por origem. Atualizar a memória do
   projeto.
9. **Se o gate reprovar e a equipe quiser ajustar:** cada configuração nova
   vira rodada separada, avaliada **só no ajuste**, com `--apenas-novos`. O
   final é olhado **uma vez por configuração candidata**, e cada olhada é
   registrada na ADR. Escolher uma segunda configuração depois de ver o final
   transforma o final em ajuste, e a decisão seguinte exige consultas finais
   novas.

## Carga humana

O pool de cada consulta é a união deduplicada dos top-10 de
`lexical_producao`, `lexical_rank` e `hibrido`. As duas bases saem do mesmo
conjunto de acertos lexicais, e o híbrido repete a maior parte do topo lexical.
Com `apenas_abertas` e UF SP, muitas consultas têm menos de 10 acertos.
Estimativa: **média de 18 candidatos por consulta** (faixa de 12 a 25; teto
de 30).

A página com atalhos e um candidato por vez tira o tempo de navegar pela
planilha. A estimativa cai de 12 s para **9 s por julgamento**, e é o
controlador quem a confere na calibração.

| item | conta | resultado |
|---|---|---|
| pares a julgar | 130 × 18 | **2.340** |
| julgamentos principais | 2.340 × 2 | **4.680** |
| calibração | 10 × 18 × 2 | 360 |
| **total de julgamentos** | | **≈ 5.040** |
| julgamento principal por avaliador | 2.340 × 9 s | 5,9 h |
| calibração por avaliador | 180 × 9 s + 30 min de conversa | 1,0 h |
| consenso, os dois juntos | ~30% divergentes ≈ 700 × 15 s | 2,9 h |
| **por avaliador** | | **≈ 9,8 h** |
| **avaliadores, total** | 2 × 9,8 h | **≈ 20 pessoa-horas**, faixa 13–27 |
| revisão das 130 consultas | ~1 min por consulta | ≈ 2–3 h da equipe |
| **total humano** | | **≈ 22–23 pessoa-horas**, faixa 15–30 |

Em sessões de 1 h, são cerca de 10 sessões por avaliador: umas duas semanas a
uma sessão por dia útil, mais a reunião de consenso.

**O que reduz carga sem enviesar:** a deduplicação, que já está no desenho, e
tirar `lexical_producao` do pool (cerca de −20%, perdendo a resposta de
produto).

**O que reduz carga enviesando** (fora do plano):

- profundidade menor que 10;
- julgar só uma amostra do pool;
- um avaliador só, com o segundo numa amostra;
- qualquer LLM no julgamento.
