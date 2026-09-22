import { readFileSync } from "node:fs";

function lerEnv() {
  const texto = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const env = {};
  for (const linha of texto.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = lerEnv();

async function liberarJobTravado() {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/sincronizacoes?status=eq.em_andamento`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  const emAndamento = await res.json();
  if (!Array.isArray(emAndamento) || emAndamento.length === 0) {
    console.log("Nenhum job em andamento para liberar.");
    return;
  }

  for (const job of emAndamento) {
    console.log(`Liberando job ${job.id} (iniciado em ${job.inicio_em})...`);
    const patchRes = await fetch(`${env.SUPABASE_URL}/rest/v1/sincronizacoes?id=eq.${job.id}`, {
      method: "PATCH",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: "parcial",
        mensagem_erro: "Interrompida: API do PNCP (/api/consulta) inacessível (servidor federal sem resposta)",
        finalizado_em: new Date().toISOString(),
      }),
    });
    console.log(`Resultado PATCH: ${patchRes.status} ${patchRes.statusText}`);
  }
}

liberarJobTravado();
