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

async function verificarSupabase() {
  console.log("\n=== 1. VERIFICANDO TABELA SINCRONIZACOES NO SUPABASE ===");
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/sincronizacoes?order=inicio_em.desc&limit=5`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    const dados = await res.json();
    if (!Array.isArray(dados)) {
      console.log("Resposta Supabase não é array:", dados);
      return;
    }
    for (const j of dados) {
      console.log(`- ID: ${j.id}`);
      console.log(`  Status: ${j.status} | Tipo: ${j.tipo} | Escopo: ${j.descricao_escopo}`);
      console.log(`  Início: ${j.inicio_em} | Fim: ${j.finalizado_em ?? "ainda não finalizado"}`);
      console.log(`  Progresso: ${j.segmentos_concluidos}/${j.segmentos_planejados} segs | ${j.paginas_consultadas} págs | ${j.registros_consultados} registros`);
      console.log(`  Erros API: timeouts=${j.api_timeouts} | 429=${j.api_erros_429} | 5xx=${j.api_erros_5xx} | outros=${j.api_falhas_outros}`);
      console.log(`  Mensagem: ${j.mensagem_erro ?? "nenhuma"}\n`);
    }

    // Verificar se existe job em_andamento
    const resAndamento = await fetch(`${env.SUPABASE_URL}/rest/v1/sincronizacoes?status=eq.em_andamento&limit=1`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    const emAndamento = await resAndamento.json();
    if (Array.isArray(emAndamento) && emAndamento.length > 0) {
      console.log(`🚨 ATENÇÃO: Existe um job TRAVADO em 'em_andamento'! ID: ${emAndamento[0].id}`);
    } else {
      console.log("✓ Nenhum job travado em 'em_andamento'.");
    }
  } catch (e) {
    console.error("Erro ao consultar Supabase:", e);
  }
}

async function testarEndpoint(nome, url, timeoutMs = 15000) {
  console.log(`\n=== TESTANDO: ${nome} ===`);
  console.log(`URL: ${url}`);
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json, text/html, */*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const duracao = Date.now() - t0;
    console.log(`Status: ${res.status} ${res.statusText} (${duracao} ms)`);
    const texto = await res.text();
    console.log(`Tamanho: ${texto.length} bytes`);
    console.log(`Amostra: ${texto.slice(0, 180)}...`);
    return { ok: res.ok, status: res.status, duracao };
  } catch (err) {
    const duracao = Date.now() - t0;
    console.log(`FALHA após ${duracao} ms: ${err.message}`);
    return { ok: false, erro: err.message, duracao };
  }
}

async function main() {
  await verificarSupabase();

  // Testar documentação OpenAPI / Swagger do PNCP
  await testarEndpoint(
    "PNCP Swagger Docs (v3/api-docs)",
    "https://pncp.gov.br/api/consulta/v3/api-docs",
    12000
  );

  // Testar endpoint de modalidades
  await testarEndpoint(
    "PNCP Domínio Modalidades",
    "https://pncp.gov.br/api/consulta/v1/modalidades",
    12000
  );

  // Testar endpoint de itens/unidades ou orgaos
  await testarEndpoint(
    "PNCP Portal Raiz (HTML)",
    "https://pncp.gov.br",
    12000
  );
}

main();
