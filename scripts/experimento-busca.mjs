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

import { resumoLatencia } from "./lib/estatistica.mjs";

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

// Repeticoes da fase de latencia por consulta. Com as 12 consultas do arquivo
// de avaliacao, o padrao 9 da 9 x 12 = 108 execucoes, acima do minimo de 100
// que a ADR-001 exige para o percentil ter resolucao de verdade.
const REPETICOES = Number(process.env.EXPERIMENTO_REPETICOES ?? 9);

const consultas = JSON.parse(
  readFileSync(new URL("../docs/superpowers/specs/consultas-avaliacao.json", import.meta.url), "utf8"),
);

const relatorio = {
  gerado_em: new Date().toISOString(),
  modelo: MODELO,
  // Qual caminho foi REALMENTE exercitado. Com hibrido_ativo = false (o padrao),
  // buscar_licitacoes_hibrida devolve o resultado lexical e diz modo: 'lexical'.
  // Guardar esse campo sem olhar para ele foi o que permitiu, antes desta
  // correcao, um relatorio afirmar gates cumpridos medindo o caminho errado.
  modo_observado: null,
  cobertura: null,
  consultas: [],
  latencia_ms: {},
  gates: {},
  falhas: [],
};

// Falhar aqui quase sempre significa uma coisa so: o esquema ainda nao foi
// colado no SQL Editor. Dizer isso e mais util que um stack trace.
try {
  relatorio.cobertura = await rpc("cobertura_embeddings", {});
} catch (e) {
  console.error("Nao consegui ler a cobertura de embeddings:", String(e.message).slice(0, 160));
  for (const linha of [
    "",
    "O esquema da busca semantica provavelmente ainda nao foi aplicado.",
    "Cole no SQL Editor do projeto, nesta ordem:",
    "  1. supabase/APLICAR-BUSCA-SEMANTICA.sql",
    "  2. supabase/APLICAR-FILA-EMBEDDINGS.sql",
    "  3. supabase/APLICAR-BUSCA-HIBRIDA.sql (depois da carga inicial de embeddings)",
    "Depois rode: npm run verificar:busca",
  ]) {
    console.error(linha);
  }
  process.exit(1);
}

const pesquisaveis = relatorio.cobertura.licitacoes_pesquisaveis ?? 0;
const comEmbedding = relatorio.cobertura.licitacoes_com_embedding ?? 0;
const taxa = pesquisaveis > 0 ? comEmbedding / pesquisaveis : 0;
relatorio.gates.cobertura = { valor: taxa, minimo: 0.99, cumprido: taxa >= 0.99 };

// Aquecimento: a primeira chamada carrega o modelo em memoria (medido: 6,9 s).
await embutir("aquecimento").catch((e) => relatorio.falhas.push(`aquecimento: ${e.message}`));

// Aquecer o BANCO tambem. O primeiro acesso ao indice HNSW carrega o grafo do
// disco, e sem isto uma consulta qualquer aparece com 5 s: medido em 20/09/2026,
// p50 de 352 ms e p95 de 5.091 ms numa amostra de 12: as outras onze ficaram
// entre 106 e 430 ms. Com amostra pequena, esse unico valor vira o p95 e o
// relatorio acusa reprovacao por carregamento de indice, nao por consulta lenta.
// A ADR pede latencia "apos aquecimento" — do modelo E do banco.
try {
  const primeira = consultas.consultas[0];
  const vetorAquecimento = await embutir(primeira.texto);
  await rpc("buscar_licitacoes_hibrida", {
    p_filtros: { palavra_chave: primeira.texto },
    p_embedding: vetorAquecimento,
    p_limite: 10,
  });
} catch (e) {
  relatorio.falhas.push(`aquecimento do banco: ${e.message}`);
}

const latencias = [];
const latenciaPorConsulta = [];

for (const consulta of consultas.consultas) {
  const registro = { id: consulta.id, texto: consulta.texto, lexical: [], hibrido: [], erro: null };
  try {
    // O embedding e gerado UMA vez e reaproveitado nas REPETICOES chamadas: medir
    // o Ollama de novo a cada repeticao mediria o modelo, nao a RPC, e o
    // relogio abaixo cobre so a busca hibrida no banco.
    const literal = await embutir(consulta.texto);

    const latenciasConsulta = [];
    let hibrido;
    for (let i = 0; i < REPETICOES; i++) {
      const t0 = Date.now();
      hibrido = await rpc("buscar_licitacoes_hibrida", {
        p_filtros: { palavra_chave: consulta.texto },
        p_embedding: literal,
        p_limite: 10,
      });
      const dt = Date.now() - t0;
      latenciasConsulta.push(dt);
      latencias.push(dt);
    }

    // Lexical e comparacao de conteudo (ids, completude) sao avaliados uma vez
    // por consulta: sao sobre o que a busca devolve, nao sobre quanto tempo
    // leva, e repeti-los so multiplicaria chamadas sem medir nada novo. A
    // resposta hibrida usada aqui e a da ultima repeticao — mesma consulta e
    // mesmo embedding, entao o conteudo e o mesmo em qualquer repeticao.
    const lexical = await rpc("buscar_licitacoes", {
      p_filtros: { palavra_chave: consulta.texto },
      p_limite: 10,
    });

    registro.modo = hibrido.modo;
    relatorio.modo_observado ??= hibrido.modo ?? "desconhecido";
    registro.hibrido = (hibrido.itens ?? []).map((i) => i.id);
    registro.lexical = (lexical.itens ?? []).map((i) => i.id);
    registro.total_elegiveis = hibrido.total ?? 0;
    registro.novos_no_hibrido = registro.hibrido.filter((id) => !registro.lexical.includes(id)).length;
    // Completude sob filtros: com >= 10 elegiveis, tem que voltar 10.
    registro.completo = registro.total_elegiveis >= 10 ? registro.hibrido.length === 10 : true;

    latenciaPorConsulta.push({
      id: consulta.id,
      texto: consulta.texto,
      ...resumoLatencia(latenciasConsulta),
    });
  } catch (e) {
    registro.erro = e.message;
    relatorio.falhas.push(`${consulta.id}: ${e.message}`);
  }
  relatorio.consultas.push(registro);
}

const resumoGeral = resumoLatencia(latencias);
relatorio.latencia_ms = {
  amostras: resumoGeral.amostras,
  p50: resumoGeral.p50,
  p95: resumoGeral.p95,
  p99: resumoGeral.p99,
  min: resumoGeral.min,
  max: resumoGeral.max,
  media: resumoGeral.media,
  repeticoes_por_consulta: REPETICOES,
  // Ausencia de aviso (null) e informacao: significa que a amostra atingiu o
  // minimo que a ADR-001 exige e o percentil tem resolucao de verdade.
  aviso:
    resumoGeral.amostras < 100
      ? `amostra de ${resumoGeral.amostras} execucoes (${REPETICOES} por consulta); a ADR-001 pede >= 100. ` +
        "Com amostra pequena, p99 pode ser apenas o maximo observado, nao um percentil real."
      : null,
};
relatorio.latencia_por_consulta = latenciaPorConsulta;
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

// A mesma disciplina que a ADR impoe aos julgamentos de relevancia vale para a
// medicao: um gate so pode ser pontuado contra o caminho que esta sendo
// julgado. Se a RPC respondeu 'lexical', nada aqui mediu o hibrido — nem a
// latencia, nem a completude sob filtros — e o relatorio recusa a pontuacao em
// vez de registrar um "cumprido" que veio do caminho errado. Os valores medidos
// continuam no JSON; o que o override retira e o veredito.
const NAO_MEDIDO =
  "NAO MEDIDO: a flag hibrido_ativo esta desligada; estas latencias sao do caminho lexical";

if (relatorio.modo_observado !== "hibrido") {
  for (const gate of Object.values(relatorio.gates)) {
    gate.cumprido = false;
    gate.observacao = gate.observacao ? `${NAO_MEDIDO}. ${gate.observacao}` : NAO_MEDIDO;
  }
}

relatorio.gates.pode_ligar_hibrido = Object.entries(relatorio.gates)
  .filter(([k]) => k !== "pode_ligar_hibrido")
  .every(([, g]) => g.cumprido === true);

mkdirSync(new URL("../logs/", import.meta.url), { recursive: true });
const destino = new URL(
  `../logs/experimento-busca-${new Date().toISOString().slice(0, 10)}.json`,
  import.meta.url,
);
writeFileSync(destino, JSON.stringify(relatorio, null, 2), "utf8");

if (relatorio.modo_observado !== "hibrido") {
  console.log("");
  console.log("==========================================================================");
  console.log(`  ${NAO_MEDIDO.toUpperCase()}.`);
  console.log(`  A RPC respondeu modo='${relatorio.modo_observado}'. NENHUM gate foi`);
  console.log("  pontuado: os numeros abaixo sao do caminho lexical, nao do hibrido.");
  console.log("  Ligue configuracao_busca.hibrido_ativo antes de medir de novo.");
  console.log("==========================================================================");
  console.log("");
}

console.log(`Cobertura de embeddings: ${(taxa * 100).toFixed(2)}% (gate: >= 99%)`);
console.log(
  `Latencia: amostra de ${relatorio.latencia_ms.amostras} execucoes ` +
    `(${relatorio.latencia_ms.repeticoes_por_consulta} por consulta) | ` +
    `p50: ${relatorio.latencia_ms.p50} ms | p95: ${relatorio.latencia_ms.p95} ms | ` +
    `p99: ${relatorio.latencia_ms.p99} ms`,
);
// Ausencia de aviso (amostra >= 100) tambem e informacao — deixamos isso
// explicito em vez de imprimir "null" no terminal.
console.log(`Latencia: ${relatorio.latencia_ms.aviso ?? "amostra >= 100, sem ressalva."}`);

const maisLentas = [...relatorio.latencia_por_consulta]
  .filter((c) => c.p95 !== null)
  .sort((a, b) => b.p95 - a.p95)
  .slice(0, 3);
if (maisLentas.length > 0) {
  console.log("\nConsultas mais lentas (por p95):");
  for (const c of maisLentas) {
    console.log(`  ${c.id} | ${c.texto} | ${c.p95} ms`);
  }
}

console.log(`\nConsultas com falha: ${relatorio.falhas.length}`);
console.log(`Gate de relevancia: ${relatorio.gates.relevancia.observacao}`);
console.log(`\nPode ligar o hibrido? ${relatorio.gates.pode_ligar_hibrido ? "SIM" : "NAO"}`);
