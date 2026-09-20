/**
 * Onde estão os milissegundos da busca híbrida.
 *
 * O harness da ADR mede a latência ponta a ponta, no cliente — e nela cabe o
 * Ollama gerando o embedding da consulta, a rede até o Supabase e o Postgres.
 * Tratar isso como um número só levou a atribuir ao banco um custo que pode ser
 * de outra etapa. Este script separa as três parcelas e diz, para cada consulta,
 * qual ramo vetorial foi usado (exato ou aproximado) e quantos elegíveis havia.
 *
 *   node scripts/diagnostico-latencia-hibrida.mjs
 *
 * Exige `hibrido_ativo = true`; com a flag desligada a função devolve o caminho
 * lexical e a medição não diz nada sobre o híbrido.
 */
import { readFileSync } from "node:fs";

for (const linha of readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
  if (m?.[1] && m[2] !== undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const URL_SB = process.env.SUPABASE_URL;
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OLLAMA = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const MODELO = process.env.EMBEDDING_MODELO ?? "bge-m3";

const cabecalhos = {
  apikey: CHAVE,
  Authorization: `Bearer ${CHAVE}`,
  "content-type": "application/json",
};

// As mesmas 12 consultas do harness da ADR. Medir outro conjunto produziria
// números que não conversam com o relatório oficial — e foi justamente uma
// consulta isolada que levantou o p95 para 5 s enquanto a mediana ficou em 352.
const CONSULTAS = JSON.parse(
  readFileSync(
    new URL("../docs/superpowers/specs/consultas-avaliacao.json", import.meta.url),
    "utf8",
  ),
).consultas.map((q) => q.texto);

async function embutir(texto) {
  const t = performance.now();
  const r = await fetch(`${OLLAMA}/api/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: MODELO, input: texto }),
  });
  if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`);
  const j = await r.json();
  return { vetor: `[${j.embeddings[0].join(",")}]`, ms: performance.now() - t };
}

async function buscar(nome, args) {
  const t = performance.now();
  const r = await fetch(`${URL_SB}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: cabecalhos,
    body: JSON.stringify(args),
  });
  const corpo = await r.json();
  return { corpo, ms: performance.now() - t, ok: r.ok };
}

const config = await (
  await fetch(`${URL_SB}/rest/v1/configuracao_busca?select=hibrido_ativo,limiar_exato`, {
    headers: cabecalhos,
  })
).json();

console.log(
  `\nflag hibrido_ativo: ${config[0]?.hibrido_ativo} | limiar_exato: ${config[0]?.limiar_exato}`,
);
if (!config[0]?.hibrido_ativo) {
  console.log("AVISO: flag desligada — os números abaixo são do caminho lexical.\n");
}

// Aquecimento: a primeira chamada ao Ollama carrega o modelo e custa segundos.
// Medir isso junto das consultas seria atribuir ao híbrido um custo que só
// acontece uma vez por vida do processo.
const aquece = await embutir("aquecimento do modelo");
console.log(`aquecimento do Ollama: ${Math.round(aquece.ms)} ms (descartado)\n`);

console.log(
  "consulta".padEnd(42),
  "ollama".padStart(8),
  "rpc".padStart(8),
  "total".padStart(8),
  "estrategia".padStart(12),
  "elegiveis".padStart(10),
  "itens".padStart(6),
);

for (const consulta of CONSULTAS) {
  const emb = await embutir(consulta);
  const hibrido = await buscar("buscar_licitacoes_hibrida", {
    p_filtros: { palavra_chave: consulta },
    p_embedding: emb.vetor,
    p_limite: 10,
  });
  const lexical = await buscar("buscar_licitacoes", {
    p_filtros: { palavra_chave: consulta },
    p_limite: 10,
  });

  const c = hibrido.corpo ?? {};
  console.log(
    consulta.slice(0, 42).padEnd(42),
    `${Math.round(emb.ms)}`.padStart(8),
    `${Math.round(hibrido.ms)}`.padStart(8),
    `${Math.round(emb.ms + hibrido.ms)}`.padStart(8),
    String(c.estrategia_vetorial ?? c.modo ?? "?").padStart(12),
    String(c.elegiveis ?? "-").padStart(10),
    String(c.total ?? "-").padStart(6),
  );
  console.log(
    "".padEnd(42),
    "(lexical para comparação:".padStart(8),
    `${Math.round(lexical.ms)} ms, ${lexical.corpo?.total ?? "-"} resultados)`,
  );
}

console.log();
