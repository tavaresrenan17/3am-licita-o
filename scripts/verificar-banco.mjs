/**
 * Verificação do catálogo PNCP no Supabase.
 *
 * Roda contra o projeto real usando a service role, cria dados de teste com
 * prefixo próprio e apaga tudo no final. Cobre os critérios que não dá para
 * provar em teste de unidade:
 *
 *   I08 — reprocessar a mesma página não duplica linhas nem contadores
 *   I09 — resposta antiga não sobrescreve cabeçalho mais novo
 *   ---- campos internos da equipe sobrevivem à sincronização
 *   S02 — a chave publicável do navegador não lê nem escreve nada
 *
 * Uso: node scripts/verificar-banco.mjs
 */
import { readFileSync } from "node:fs";

const PREFIXO = "TESTE-VERIFICACAO";

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
const URL_BASE = env.SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLICAVEL = env.SUPABASE_PUBLISHABLE_KEY;

if (!URL_BASE || !SERVICE) {
  console.error(
    "Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no .env. " +
      "A chave de serviço fica em Supabase → Project Settings → API keys.",
  );
  process.exit(1);
}

const resultados = [];
const registrar = (nome, ok, detalhe = "") => {
  resultados.push({ nome, ok, detalhe });
  console.log(`${ok ? "  OK  " : " FALHA"} │ ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};

async function api(caminho, { metodo = "GET", corpo, chave = SERVICE, prefer } = {}) {
  const resposta = await fetch(`${URL_BASE}/rest/v1/${caminho}`, {
    method: metodo,
    headers: {
      apikey: chave,
      Authorization: `Bearer ${chave}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });

  const texto = await resposta.text();
  let dados = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    dados = texto;
  }
  return { status: resposta.status, ok: resposta.ok, dados };
}

const rpc = (nome, args, chave = SERVICE) =>
  api(`rpc/${nome}`, { metodo: "POST", corpo: args, chave });

/** Cabeçalho de teste no formato que o mapper produz. */
function linha(sufixo, { objeto, atualizacao, valor = 1000, score = 50 }) {
  return {
    numero_controle_pncp: `${PREFIXO}-${sufixo}`,
    cnpj_orgao: "00000000000191",
    orgao: "ORGAO DE TESTE",
    ano_compra: 2026,
    sequencial_compra: 1,
    uf: "DF",
    municipio: "Brasília",
    codigo_ibge: "5300108",
    objeto,
    modalidade_id: 6,
    modalidade_nome: "Pregão - Eletrônico",
    situacao_compra_id: 1,
    valor_total_estimado: valor,
    data_publicacao: "2026-09-10T07:00:00.000Z",
    data_abertura_proposta: "2026-09-10T11:00:00.000Z",
    data_encerramento_proposta: "2026-09-24T13:00:00.000Z",
    data_atualizacao_global: atualizacao,
    categoria: "Obra nova",
    score_aderencia: score,
    source_hash: `${sufixo}-${objeto.length}-${atualizacao}`,
    fetched_at: new Date().toISOString(),
  };
}

async function limpar(jobId) {
  if (jobId) await api(`sincronizacoes?id=eq.${jobId}`, { metodo: "DELETE" });
  await api(`licitacoes?numero_controle_pncp=like.${PREFIXO}*`, { metodo: "DELETE" });
}

async function main() {
  console.log(`\nVerificando ${URL_BASE}\n`);

  // 1. Estrutura criada pela migração
  for (const tabela of [
    "licitacoes",
    "licitacoes_historico",
    "documentos_licitacao",
    "sincronizacoes",
    "ingestao_segmentos",
    "configuracoes",
    "modalidades",
  ]) {
    const r = await api(`${tabela}?select=*&limit=1`);
    registrar(`tabela ${tabela} existe`, r.ok, r.ok ? "" : `HTTP ${r.status}`);
  }

  // Tabela com o nome certo não basta: este banco tinha uma estrutura anterior
  // homônima. Conferir colunas próprias da nova evita "passar" sobre a antiga.
  for (const [tabela, coluna] of [
    ["licitacoes", "numero_controle_pncp"],
    ["licitacoes", "source_hash"],
    ["licitacoes", "data_encerramento_proposta"],
    ["sincronizacoes", "descricao_escopo"],
    ["ingestao_segmentos", "assinatura"],
  ]) {
    const r = await api(`${tabela}?select=${coluna}&limit=1`);
    registrar(
      `${tabela}.${coluna} (estrutura nova)`,
      r.ok,
      r.ok ? "" : `HTTP ${r.status} — a tabela pode ser a antiga`,
    );
  }

  const mods = await api("modalidades?select=id&limit=50");
  registrar(
    "domínio de modalidades semeado",
    Array.isArray(mods.dados) && mods.dados.length === 19,
    `${Array.isArray(mods.dados) ? mods.dados.length : 0} linhas (esperado 19)`,
  );

  const cfg = await api("configuracoes?select=*");
  registrar(
    "linha única de configurações",
    Array.isArray(cfg.dados) && cfg.dados.length === 1,
    `${Array.isArray(cfg.dados) ? cfg.dados.length : 0} linha(s)`,
  );

  // 2. Job e segmento de teste
  await limpar(null);
  const job = await api("sincronizacoes", {
    metodo: "POST",
    corpo: {
      status: "em_andamento",
      descricao_escopo: `${PREFIXO} — verificação automática`,
      segmentos_planejados: 1,
    },
    prefer: "return=representation",
  });
  if (!job.ok) {
    registrar("criar sincronização de teste", false, `HTTP ${job.status}`);
    return encerrar(null);
  }
  const jobId = job.dados[0].id;

  const seg = await api("ingestao_segmentos", {
    metodo: "POST",
    corpo: {
      sincronizacao_id: jobId,
      endpoint: "proposta",
      assinatura: `${PREFIXO}-assinatura`,
      descricao: "segmento de verificação",
      query: { dataFinal: "20261011", uf: "DF", tamanhoPagina: 10 },
    },
    prefer: "return=representation",
  });
  if (!seg.ok) {
    registrar("criar segmento de teste", false, `HTTP ${seg.status}`);
    return encerrar(jobId);
  }
  const segmentoId = seg.dados[0].id;

  const lote = [
    linha("A", { objeto: "Construção de escola municipal", atualizacao: "2026-09-10T07:01:00.000Z" }),
    linha("B", { objeto: "Pavimentação de vias urbanas", atualizacao: "2026-09-10T07:02:00.000Z" }),
  ];

  // 3. I08 — primeira gravação e reentrega da mesma página
  const merge1 = await rpc("pncp_merge_page", {
    p_segmento_id: segmentoId,
    p_pagina: 1,
    p_total_paginas: 2,
    p_total_registros: 2,
    p_rows: lote,
  });
  registrar(
    "merge da página 1 grava as duas linhas",
    merge1.ok && merge1.dados?.novos === 2,
    merge1.ok ? `novos=${merge1.dados.novos}` : `HTTP ${merge1.status}: ${JSON.stringify(merge1.dados)}`,
  );

  const merge1b = await rpc("pncp_merge_page", {
    p_segmento_id: segmentoId,
    p_pagina: 1,
    p_total_paginas: 2,
    p_total_registros: 2,
    p_rows: lote,
  });
  registrar(
    "I08: reprocessar a mesma página não repete efeitos",
    merge1b.ok && merge1b.dados?.aplicado === false,
    merge1b.ok ? `motivo=${merge1b.dados.motivo}` : `HTTP ${merge1b.status}`,
  );

  const contagem = await api(
    `licitacoes?select=numero_controle_pncp&numero_controle_pncp=like.${PREFIXO}*`,
  );
  registrar(
    "I08: catálogo continua com 2 linhas (sem duplicata)",
    Array.isArray(contagem.dados) && contagem.dados.length === 2,
    `${Array.isArray(contagem.dados) ? contagem.dados.length : 0} linha(s)`,
  );

  const job1 = await api(`sincronizacoes?id=eq.${jobId}&select=total_novos,paginas_consultadas`);
  registrar(
    "I08: contadores do job não somam duas vezes",
    job1.dados?.[0]?.total_novos === 2 && job1.dados?.[0]?.paginas_consultadas === 1,
    `novos=${job1.dados?.[0]?.total_novos}, páginas=${job1.dados?.[0]?.paginas_consultadas}`,
  );

  // 4. Campos internos da equipe
  const alvo = await api(
    `licitacoes?select=id&numero_controle_pncp=eq.${PREFIXO}-A`,
  );
  const idA = alvo.dados?.[0]?.id;
  await rpc("atualizar_licitacao_interna", {
    p_id: idA,
    p_status_interno: "interessante",
    p_prioridade: true,
    p_observacoes: "Anotação da equipe",
    p_historico: "Marcada na verificação",
  });

  // 5. I09 — resposta antiga chegando depois da nova
  const antiga = [
    linha("A", {
      objeto: "VERSÃO ANTIGA QUE NÃO PODE VENCER",
      atualizacao: "2026-09-01T00:00:00.000Z",
    }),
  ];
  const merge2 = await rpc("pncp_merge_page", {
    p_segmento_id: segmentoId,
    p_pagina: 2,
    p_total_paginas: 2,
    p_total_registros: 2,
    p_rows: antiga,
  });
  registrar(
    "merge da página 2 aceito",
    merge2.ok && merge2.dados?.aplicado === true,
    merge2.ok ? `ignorados=${merge2.dados.ignorados}` : `HTTP ${merge2.status}`,
  );

  const depois = await api(
    `licitacoes?select=objeto,status_interno,prioridade,observacoes&numero_controle_pncp=eq.${PREFIXO}-A`,
  );
  const linhaA = depois.dados?.[0];
  registrar(
    "I09: versão antiga não sobrescreveu o cabeçalho novo",
    linhaA?.objeto === "Construção de escola municipal",
    `objeto atual: "${linhaA?.objeto}"`,
  );
  registrar(
    "campos internos sobrevivem à sincronização",
    linhaA?.status_interno === "interessante" &&
      linhaA?.prioridade === true &&
      linhaA?.observacoes === "Anotação da equipe",
    `status=${linhaA?.status_interno}, prioridade=${linhaA?.prioridade}`,
  );

  const segFinal = await api(
    `ingestao_segmentos?id=eq.${segmentoId}&select=status,proxima_pagina,paginas_aplicadas`,
  );
  registrar(
    "segmento concluído ao alcançar a última página",
    segFinal.dados?.[0]?.status === "concluido" && segFinal.dados?.[0]?.paginas_aplicadas === 2,
    `status=${segFinal.dados?.[0]?.status}, páginas=${segFinal.dados?.[0]?.paginas_aplicadas}`,
  );

  // 6. S02 — RLS: a chave do navegador não pode ler nem escrever
  if (PUBLICAVEL) {
    const leitura = await api("licitacoes?select=id&limit=1", { chave: PUBLICAVEL });
    const vazio = Array.isArray(leitura.dados) && leitura.dados.length === 0;
    registrar(
      "S02: chave publicável não lê o catálogo",
      !leitura.ok || vazio,
      `HTTP ${leitura.status}${vazio ? " (retorno vazio)" : ""}`,
    );

    const escrita = await api("licitacoes", {
      metodo: "POST",
      chave: PUBLICAVEL,
      corpo: { numero_controle_pncp: `${PREFIXO}-INVASOR`, source_hash: "x" },
    });
    registrar(
      "S02: chave publicável não grava no catálogo",
      !escrita.ok,
      `HTTP ${escrita.status}`,
    );

    const rpcPublica = await rpc("buscar_licitacoes", { p_filtros: {} }, PUBLICAVEL);
    registrar(
      "S02: chave publicável não executa as RPCs",
      !rpcPublica.ok,
      `HTTP ${rpcPublica.status}`,
    );
  } else {
    registrar("S02: teste de RLS", false, "SUPABASE_PUBLISHABLE_KEY ausente no .env");
  }

  await encerrar(jobId);
}

async function encerrar(jobId) {
  await limpar(jobId);
  const falhas = resultados.filter((r) => !r.ok);
  console.log(
    `\n${resultados.length - falhas.length}/${resultados.length} verificações passaram.\n`,
  );
  if (falhas.length > 0) {
    console.log("Falhas:");
    for (const f of falhas) console.log(`  - ${f.nome}${f.detalhe ? `: ${f.detalhe}` : ""}`);
    process.exit(1);
  }
}

main().catch(async (e) => {
  console.error("Erro na verificação:", e);
  await limpar(null);
  process.exit(1);
});
