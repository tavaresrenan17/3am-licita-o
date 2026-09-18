#!/usr/bin/env node
/**
 * Benchmark somente leitura das duas fronteiras externas do pipeline:
 * API de consulta do PNCP e RPC de busca do Supabase.
 *
 * Uso:
 *   npm run benchmark:pipeline -- --repeticoes 5 --aquecimentos 1 --timeout-ms 30000
 *   npm run benchmark:pipeline -- --somente supabase --saida benchmark.json
 *   npm run benchmark:pipeline -- --ajuda
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const PNCP_BASE = "https://pncp.gov.br/api/consulta/v1";

export function calcularPercentis(valores) {
  if (!Array.isArray(valores) || valores.length === 0) {
    throw new TypeError("A amostra precisa conter ao menos uma duração.");
  }
  const ordenados = [...valores].sort((a, b) => a - b);
  const percentil = (p) => ordenados[Math.max(0, Math.ceil((p / 100) * ordenados.length) - 1)];
  const media = ordenados.reduce((soma, valor) => soma + valor, 0) / ordenados.length;
  return {
    minimoMs: ordenados[0],
    p50Ms: percentil(50),
    p95Ms: percentil(95),
    p99Ms: percentil(99),
    maximoMs: ordenados.at(-1),
    mediaMs: Number(media.toFixed(2)),
  };
}

export function classificarErro(erro) {
  if (erro?.name === "TimeoutError" || erro?.name === "AbortError") return { tipo: "timeout" };
  if (erro?.codigo === "PGRST203") {
    return {
      tipo: "configuracao_rpc",
      status: erro.status,
      orientacao: "Execute novamente com --rpc-legada-vetorial.",
    };
  }
  if (Number.isInteger(erro?.status)) return { tipo: "http", status: erro.status };
  if (erro?.name === "ErroContratoResposta") return { tipo: "contrato" };
  return { tipo: "transporte" };
}

export function validarConfiguracao(entrada = {}) {
  const configuracao = {
    repeticoes: Number(entrada.repeticoes ?? 5),
    aquecimentos: Number(entrada.aquecimentos ?? 1),
    timeoutMs: Number(entrada.timeoutMs ?? 30_000),
    seed: Number(entrada.seed ?? 42),
  };
  if (
    !Number.isInteger(configuracao.repeticoes) ||
    configuracao.repeticoes < 1 ||
    configuracao.repeticoes > 100
  ) {
    throw new RangeError("repeticoes deve ser um inteiro entre 1 e 100.");
  }
  if (
    !Number.isInteger(configuracao.aquecimentos) ||
    configuracao.aquecimentos < 0 ||
    configuracao.aquecimentos > 20
  ) {
    throw new RangeError("aquecimentos deve ser um inteiro entre 0 e 20.");
  }
  if (
    !Number.isInteger(configuracao.timeoutMs) ||
    configuracao.timeoutMs < 100 ||
    configuracao.timeoutMs > 120_000
  ) {
    throw new RangeError("timeoutMs deve estar entre 100 e 120000.");
  }
  if (!Number.isInteger(configuracao.seed) || configuracao.seed < 0) {
    throw new RangeError("seed deve ser um inteiro não negativo.");
  }
  return configuracao;
}

function geradorAleatorio(seed) {
  let estado = seed >>> 0;
  return () => {
    estado = (estado * 1_664_525 + 1_013_904_223) >>> 0;
    return estado / 4_294_967_296;
  };
}

export function embaralhar(itens, aleatorio = Math.random) {
  const saida = [...itens];
  for (let i = saida.length - 1; i > 0; i -= 1) {
    const j = Math.floor(aleatorio() * (i + 1));
    [saida[i], saida[j]] = [saida[j], saida[i]];
  }
  return saida;
}

function lerEnvLocal() {
  const caminho = new URL("../.env", import.meta.url);
  if (!existsSync(caminho)) return {};
  const env = {};
  for (const linha of readFileSync(caminho, "utf8").split(/\r?\n/)) {
    const correspondencia = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
    if (correspondencia) env[correspondencia[1]] = correspondencia[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function erroHttp(status, dados) {
  return Object.assign(new Error(`HTTP ${status}`), {
    status,
    codigo: typeof dados?.code === "string" ? dados.code : undefined,
  });
}

function erroContrato() {
  return Object.assign(new Error("Resposta fora do contrato esperado."), {
    name: "ErroContratoResposta",
  });
}

async function requisitar(url, opcoes, timeoutMs, validarResposta) {
  const resposta = await fetch(url, { ...opcoes, signal: AbortSignal.timeout(timeoutMs) });
  const texto = await resposta.text();
  let dados;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    if (!resposta.ok) throw erroHttp(resposta.status);
    throw erroContrato();
  }
  if (!resposta.ok) throw erroHttp(resposta.status, dados);
  if (!validarResposta(dados)) throw erroContrato();
  return { status: resposta.status, bytes: Buffer.byteLength(texto) };
}

function dataPncp(diasAdiante = 30) {
  const data = new Date();
  data.setUTCDate(data.getUTCDate() + diasAdiante);
  return data.toISOString().slice(0, 10).replaceAll("-", "");
}

export function escolherCredencialSupabase(env, usarServiceRole = false) {
  if (usarServiceRole) return env.SUPABASE_SERVICE_ROLE_KEY;
  return env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_PUBLISHABLE_KEY;
}

export function validarAcessoSupabase(env, { usarServiceRole = false, somente = "todos" } = {}) {
  if (somente === "pncp") return;
  if (!env.SUPABASE_URL) {
    throw new Error("SUPABASE_URL está ausente; informe a URL para executar os cenários Supabase.");
  }
  const publica = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_PUBLISHABLE_KEY;
  if (!usarServiceRole && !publica && env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "A RPC não possui chave publicável configurada. Execute com --usar-service-role para autorizar explicitamente o benchmark somente leitura.",
    );
  }
  if (usarServiceRole && !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "--usar-service-role foi informado, mas SUPABASE_SERVICE_ROLE_KEY está ausente.",
    );
  }
  if (!usarServiceRole && !publica) {
    throw new Error("Nenhuma chave publicável foi configurada para os cenários Supabase.");
  }
}

function validarDataBase(valor) {
  if (!/^\d{8}$/.test(valor)) {
    throw new Error("--data-base deve usar o formato AAAAMMDD.");
  }
  const ano = Number(valor.slice(0, 4));
  const mes = Number(valor.slice(4, 6));
  const dia = Number(valor.slice(6, 8));
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    throw new Error("--data-base contém uma data impossível.");
  }
  return valor;
}

export function criarCenarios({
  supabaseUrl,
  supabaseKey,
  timeoutMs,
  dataBasePncp = dataPncp(),
  rpcLegadaVetorial = false,
}) {
  const dataFinal = validarDataBase(dataBasePncp);
  const pncpUrl = new URL(`${PNCP_BASE}/contratacoes/proposta`);
  pncpUrl.search = new URLSearchParams({
    dataFinal,
    uf: "SP",
    pagina: "1",
    tamanhoPagina: "10",
  }).toString();

  const cenarios = [
    {
      nome: "pncp.propostas_sp",
      origem: "pncp",
      parametros: {
        endpoint: "/contratacoes/proposta",
        dataFinal,
        uf: "SP",
        pagina: 1,
        tamanhoPagina: 10,
      },
      executar: () =>
        requisitar(
          pncpUrl,
          { headers: { Accept: "application/json" } },
          timeoutMs,
          (dados) => Array.isArray(dados?.data) && Number.isInteger(dados?.numeroPagina),
        ),
    },
  ];

  if (supabaseUrl && supabaseKey) {
    const consultas = [
      ["supabase.baseline_catalogo", {}],
      ["supabase.abertas_sp", { uf: "SP", apenas_abertas: true }],
      [
        "supabase.palavra_e_filtros_sp",
        {
          uf: "SP",
          apenas_abertas: true,
          palavra_chave: "servicos",
          modalidade: "Pregão - Eletrônico",
          valor_min: "10000",
        },
      ],
    ];
    for (const [nome, filtros] of consultas)
      cenarios.push({
        nome,
        origem: "supabase",
        parametros: {
          rpc: "buscar_licitacoes",
          filtros,
          limite: 25,
          usaAssinaturaLegada: rpcLegadaVetorial,
        },
        executar: () => {
          const corpo = {
            p_filtros: filtros,
            p_ordenar: "data_encerramento_proposta",
            p_direcao: "asc",
            p_limite: 25,
            p_deslocamento: 0,
            p_agora: new Date().toISOString(),
            p_score_minimo: 60,
          };
          if (rpcLegadaVetorial) corpo.p_embedding = null;
          return requisitar(
            `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/buscar_licitacoes`,
            {
              method: "POST",
              headers: {
                apikey: supabaseKey,
                Authorization: `Bearer ${supabaseKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(corpo),
            },
            timeoutMs,
            (dados) => Array.isArray(dados?.itens) && Number.isInteger(dados?.total),
          );
        },
      });
  }
  return cenarios;
}

async function medir(executar) {
  const inicio = performance.now();
  try {
    const resposta = await executar();
    return {
      ok: true,
      duracaoMs: Number((performance.now() - inicio).toFixed(2)),
      status: resposta.status,
      bytes: resposta.bytes,
    };
  } catch (erro) {
    return {
      ok: false,
      duracaoMs: Number((performance.now() - inicio).toFixed(2)),
      erro: classificarErro(erro),
    };
  }
}

export async function executarBenchmark({ cenarios, configuracao, metadados = {} }) {
  const aleatorio = geradorAleatorio(configuracao.seed);
  const aquecimentos = [];
  for (let rodada = 0; rodada < configuracao.aquecimentos; rodada += 1) {
    for (const cenario of embaralhar(cenarios, aleatorio)) {
      aquecimentos.push(await medir(cenario.executar));
    }
  }

  const medicoes = Object.fromEntries(cenarios.map((cenario) => [cenario.nome, []]));
  for (let rodada = 0; rodada < configuracao.repeticoes; rodada += 1) {
    for (const cenario of embaralhar(cenarios, aleatorio)) {
      medicoes[cenario.nome].push(await medir(cenario.executar));
    }
  }

  const resultados = cenarios.map((cenario) => {
    const tentativas = medicoes[cenario.nome];
    const sucessos = tentativas.filter((item) => item.ok);
    const falhas = tentativas.filter((item) => !item.ok);
    return {
      cenario: cenario.nome,
      origem: cenario.origem,
      parametros: cenario.parametros,
      tentativas: tentativas.length,
      sucessos: sucessos.length,
      falhas: falhas.length,
      latencia: sucessos.length ? calcularPercentis(sucessos.map((item) => item.duracaoMs)) : null,
      erros: Object.values(
        falhas.reduce((grupos, item) => {
          const chave = `${item.erro.tipo}:${item.erro.status ?? ""}`;
          grupos[chave] ??= { ...item.erro, quantidade: 0 };
          grupos[chave].quantidade += 1;
          return grupos;
        }, {}),
      ),
      amostras: tentativas,
    };
  });
  return {
    geradoEm: new Date().toISOString(),
    configuracao,
    metadados,
    aquecimento: {
      tentativas: aquecimentos.length,
      sucessos: aquecimentos.filter((item) => item.ok).length,
      falhas: aquecimentos.filter((item) => !item.ok).length,
    },
    resultados,
  };
}

export function selecionarCenarios(cenarios, somente = "todos") {
  if (!["pncp", "supabase", "todos"].includes(somente)) {
    throw new Error("--somente deve ser pncp, supabase ou todos.");
  }
  return somente === "todos" ? cenarios : cenarios.filter((cenario) => cenario.origem === somente);
}

export function parseArgumentos(argv) {
  const saida = {};
  const opcoesComValor = new Map([
    ["--repeticoes", "repeticoes"],
    ["--aquecimentos", "aquecimentos"],
    ["--timeout-ms", "timeoutMs"],
    ["--seed", "seed"],
    ["--somente", "somente"],
    ["--saida", "saida"],
    ["--data-base", "dataBasePncp"],
  ]);
  const opcoesBooleanas = new Map([
    ["--usar-service-role", "usarServiceRole"],
    ["--rpc-legada-vetorial", "rpcLegadaVetorial"],
    ["--ajuda", "ajuda"],
    ["-h", "ajuda"],
  ]);
  for (let i = 0; i < argv.length; i += 1) {
    const opcao = argv[i];
    const campoBooleano = opcoesBooleanas.get(opcao);
    if (campoBooleano) {
      saida[campoBooleano] = true;
      continue;
    }
    const campo = opcoesComValor.get(opcao);
    if (!campo) throw new Error(`Opção desconhecida: ${opcao}. Use --ajuda.`);
    const valor = argv[i + 1];
    if (valor === undefined || valor.startsWith("-")) {
      throw new Error(`Falta valor para ${opcao}. Use --ajuda.`);
    }
    saida[campo] = valor;
    i += 1;
  }
  return saida;
}

async function main() {
  const args = parseArgumentos(process.argv.slice(2));
  if (args.ajuda) {
    process.stdout.write(`Benchmark somente leitura PNCP → Supabase

Uso:
  npm run benchmark:pipeline -- [opções]

Opções:
  --repeticoes N            Amostras medidas por cenário (padrão: 5)
  --aquecimentos N          Rodadas descartadas antes da medição (padrão: 1)
  --timeout-ms N            Timeout de cada requisição (padrão: 30000)
  --seed N                  Seed da ordem aleatória (padrão: 42)
  --data-base AAAAMMDD      Data final usada na consulta PNCP
  --somente ORIGEM          pncp, supabase ou todos
  --saida ARQUIVO           Também grava o relatório JSON no arquivo
  --usar-service-role       Autoriza explicitamente a chave privilegiada
  --rpc-legada-vetorial     Compatibilidade temporária com a overload p_embedding
  --ajuda, -h               Exibe esta ajuda

Base remota atual:
  npm run benchmark:pipeline -- --usar-service-role --rpc-legada-vetorial
`);
    return;
  }
  const configuracao = validarConfiguracao(args);
  const arquivoEnv = lerEnvLocal();
  const env = { ...arquivoEnv, ...process.env };
  const somente = args.somente ?? "todos";
  validarAcessoSupabase(env, {
    usarServiceRole: Boolean(args.usarServiceRole),
    somente,
  });
  const dataBasePncp = args.dataBasePncp ?? env.BENCHMARK_PNCP_DATA_BASE ?? dataPncp();
  const supabaseKey = escolherCredencialSupabase(env, args.usarServiceRole);
  let cenarios = criarCenarios({
    supabaseUrl: env.SUPABASE_URL,
    supabaseKey,
    timeoutMs: configuracao.timeoutMs,
    dataBasePncp,
    rpcLegadaVetorial: args.rpcLegadaVetorial,
  });
  cenarios = selecionarCenarios(cenarios, somente);
  const relatorio = await executarBenchmark({
    cenarios,
    configuracao,
    metadados: {
      dataBasePncp,
      credencialSupabase: supabaseKey
        ? args.usarServiceRole
          ? "service-role-explicita"
          : "publicavel"
        : "ausente",
      rpcLegadaVetorial: Boolean(args.rpcLegadaVetorial),
    },
  });
  const json = `${JSON.stringify(relatorio, null, 2)}\n`;
  if (args.saida) writeFileSync(args.saida, json, "utf8");
  process.stdout.write(json);
  if (relatorio.resultados.some((resultado) => resultado.sucessos === 0)) process.exitCode = 2;
}

const executadoDiretamente =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executadoDiretamente) {
  main().catch((erro) => {
    process.stderr.write(`${erro.message}\n`);
    process.exitCode = 1;
  });
}
