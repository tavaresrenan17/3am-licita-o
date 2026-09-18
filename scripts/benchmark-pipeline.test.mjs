import assert from "node:assert/strict";
import test from "node:test";

import {
  calcularPercentis,
  classificarErro,
  criarCenarios,
  escolherCredencialSupabase,
  executarBenchmark,
  parseArgumentos,
  selecionarCenarios,
  validarAcessoSupabase,
  validarConfiguracao,
} from "./benchmark-pipeline.mjs";

test("calcula p50, p95 e p99 por nearest-rank sem alterar a amostra", () => {
  const amostra = [100, 1, 20, 5, 50];

  assert.deepEqual(calcularPercentis(amostra), {
    minimoMs: 1,
    p50Ms: 20,
    p95Ms: 100,
    p99Ms: 100,
    maximoMs: 100,
    mediaMs: 35.2,
  });
  assert.deepEqual(amostra, [100, 1, 20, 5, 50]);
});

test("recusa amostra vazia ao calcular percentis", () => {
  assert.throws(() => calcularPercentis([]), /amostra/i);
});

test("classifica timeout, HTTP e falha de transporte sem expor mensagem sensível", () => {
  assert.deepEqual(classificarErro(new DOMException("aborted", "TimeoutError")), {
    tipo: "timeout",
  });
  assert.deepEqual(classificarErro({ status: 503 }), {
    tipo: "http",
    status: 503,
  });
  assert.deepEqual(classificarErro(new Error("token=segredo")), {
    tipo: "transporte",
  });
  assert.deepEqual(classificarErro({ status: 300, codigo: "PGRST203" }), {
    tipo: "configuracao_rpc",
    status: 300,
    orientacao: "Execute novamente com --rpc-legada-vetorial.",
  });
});

test("valida limites e normaliza a configuração", () => {
  assert.deepEqual(
    validarConfiguracao({ repeticoes: "3", aquecimentos: "1", timeoutMs: "5000", seed: "9" }),
    { repeticoes: 3, aquecimentos: 1, timeoutMs: 5000, seed: 9 },
  );
  assert.throws(
    () => validarConfiguracao({ repeticoes: "0", aquecimentos: "1", timeoutMs: "5000" }),
    /repeticoes/i,
  );
  assert.throws(
    () => validarConfiguracao({ repeticoes: "3", aquecimentos: "-1", timeoutMs: "5000" }),
    /aquecimentos/i,
  );
  assert.throws(
    () => validarConfiguracao({ repeticoes: "3", aquecimentos: "1", timeoutMs: "99" }),
    /timeout/i,
  );
});

test("mantém ordem reproduzível por seed e separa aquecimento das amostras", async () => {
  const ordem = [];
  const cenarios = ["a", "b", "c"].map((nome) => ({
    nome,
    origem: "pncp",
    parametros: { pagina: 1 },
    executar: async () => {
      ordem.push(nome);
      return { status: 200, bytes: 2 };
    },
  }));

  const relatorio = await executarBenchmark({
    cenarios,
    configuracao: { repeticoes: 2, aquecimentos: 1, timeoutMs: 1000, seed: 7 },
  });

  assert.deepEqual(ordem, ["c", "b", "a", "a", "c", "b", "c", "b", "a"]);
  assert.equal(relatorio.aquecimento.tentativas, 3);
  assert.equal(relatorio.aquecimento.sucessos, 3);
  assert.equal(relatorio.resultados[0].tentativas, 2);
  assert.deepEqual(relatorio.resultados[0].parametros, { pagina: 1 });
});

test("filtra cenários por origem e rejeita seleção inválida", () => {
  const cenarios = [
    { nome: "api", origem: "pncp" },
    { nome: "db", origem: "supabase" },
  ];
  assert.deepEqual(selecionarCenarios(cenarios, "supabase"), [cenarios[1]]);
  assert.deepEqual(selecionarCenarios(cenarios, "todos"), cenarios);
  assert.throws(() => selecionarCenarios(cenarios, "outro"), /somente/i);
});

test("prefere chave publicável e só usa service role com opção explícita", () => {
  const env = {
    VITE_SUPABASE_PUBLISHABLE_KEY: "publica-vite",
    SUPABASE_PUBLISHABLE_KEY: "publica",
    SUPABASE_SERVICE_ROLE_KEY: "service-secreta",
  };
  assert.equal(escolherCredencialSupabase(env, false), "publica-vite");
  assert.equal(escolherCredencialSupabase(env, true), "service-secreta");
  assert.equal(
    escolherCredencialSupabase({ SUPABASE_SERVICE_ROLE_KEY: "service-secreta" }, false),
    undefined,
  );
});

test("recusa data PNCP impossível por round-trip", () => {
  assert.throws(() => criarCenarios({ timeoutMs: 1000, dataBasePncp: "20260231" }), /data-base/i);
  assert.doesNotThrow(() => criarCenarios({ timeoutMs: 1000, dataBasePncp: "20260228" }));
});

test("exige opt-in explícito quando somente a service role está disponível", () => {
  assert.throws(
    () =>
      validarAcessoSupabase(
        { SUPABASE_URL: "https://exemplo.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "secreta" },
        { usarServiceRole: false, somente: "todos" },
      ),
    /--usar-service-role/,
  );
  assert.doesNotThrow(() =>
    validarAcessoSupabase(
      { SUPABASE_URL: "https://exemplo.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "secreta" },
      { usarServiceRole: false, somente: "pncp" },
    ),
  );
});

test("exige URL e chave quando a execução inclui Supabase", () => {
  assert.throws(() => validarAcessoSupabase({}, { somente: "todos" }), /SUPABASE_URL/);
  assert.throws(
    () =>
      validarAcessoSupabase(
        { SUPABASE_URL: "https://exemplo.supabase.co" },
        { somente: "supabase" },
      ),
    /chave publicável/i,
  );
});

test("parser rejeita flags desconhecidas e opções sem valor", () => {
  assert.throws(() => parseArgumentos(["--desconhecida"]), /desconhecida/i);
  assert.throws(() => parseArgumentos(["--repeticoes"]), /valor.*--repeticoes/i);
  assert.throws(() => parseArgumentos(["--saida", "--somente", "pncp"]), /valor.*--saida/i);
  assert.deepEqual(parseArgumentos(["--usar-service-role", "--somente", "pncp"]), {
    usarServiceRole: true,
    somente: "pncp",
  });
});

test("relatório não contém credenciais fornecidas ao cenário", async () => {
  const segredo = "service-role-nao-pode-vazar";
  const relatorio = await executarBenchmark({
    cenarios: [
      {
        nome: "db",
        origem: "supabase",
        parametros: { uf: "SP" },
        executar: async () => ({ status: 200, bytes: 10, credencialInterna: segredo }),
      },
    ],
    configuracao: { repeticoes: 1, aquecimentos: 0, timeoutMs: 1000, seed: 1 },
  });
  assert.equal(JSON.stringify(relatorio).includes(segredo), false);
});
