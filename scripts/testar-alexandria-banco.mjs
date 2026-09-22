import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const texto = readFileSync(".env", "utf8");
const env = {};
for (const l of texto.split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(l);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: hist, error: ehist } = await supabase.from("licitacoes_historico").select("*").limit(1);
console.log("licitacoes_historico colunas:", { hist, erro: ehist?.message });
