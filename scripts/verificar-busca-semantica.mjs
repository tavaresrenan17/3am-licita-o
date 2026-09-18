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
