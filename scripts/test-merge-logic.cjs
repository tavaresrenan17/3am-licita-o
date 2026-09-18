/**
 * TESTE DE VALIDAÇÃO DA LÓGICA DE MERGE E ADMISSAO
 * Valida a integridade das regras:
 * 1. Deduplicação dentro do lote por numeroControlePNCP
 * 2. Política de admissão: "todas" vs "abertas"
 * 3. Cálculo correto de contadores (novos, atualizados, ignorados, nao_admitidos)
 */

const assert = require('assert');

function simularMergeEmMemoria({ linhasExistentes, loteEntrada, politicaAdmissao }) {
  const recebidos = loteEntrada.length;
  
  // Deduplicação pelo controle
  const deduplicados = [];
  const vistos = new Set();
  for (const item of loteEntrada) {
    if (!vistos.has(item.numeroControlePNCP)) {
      vistos.add(item.numeroControlePNCP);
      deduplicados.push(item);
    }
  }

  // Política de admissão
  const admitidas = deduplicados.filter(item => {
    if (politicaAdmissao === 'todas') return true;
    const jaExiste = linhasExistentes.some(l => l.numeroControlePNCP === item.numeroControlePNCP);
    if (jaExiste) return true;
    if (!item.dataEncerramento) return true; // sem data de encerramento = admitir
    return new Date(item.dataEncerramento) > new Date();
  });

  const naoAdmitidos = recebidos - admitidas.length;

  let novos = 0;
  let atualizados = 0;
  let ignorados = 0;

  for (const item of admitidas) {
    const existente = linhasExistentes.find(l => l.numeroControlePNCP === item.numeroControlePNCP);
    if (!existente) {
      novos++;
    } else if (existente.hash !== item.hash) {
      atualizados++;
    } else {
      ignorados++;
    }
  }

  return { recebidos, admitidos: admitidas.length, naoAdmitidos, novos, atualizados, ignorados };
}

function executarTestesMerge() {
  console.log("=== EXECUTANDO TESTE DA LÓGICA DE MERGE E ADMISSÃO ===");

  const baseExistente = [
    { numeroControlePNCP: "001", hash: "hash_antigo", dataEncerramento: "2026-10-01" },
    { numeroControlePNCP: "002", hash: "hash_igual", dataEncerramento: "2026-10-01" }
  ];

  const lote = [
    { numeroControlePNCP: "001", hash: "hash_novo", dataEncerramento: "2026-10-01" }, // atualizado
    { numeroControlePNCP: "002", hash: "hash_igual", dataEncerramento: "2026-10-01" }, // ignorado (mesmo hash)
    { numeroControlePNCP: "003", hash: "hash_novo3", dataEncerramento: "2026-12-01" }, // novo (aberto)
    { numeroControlePNCP: "004", hash: "hash_novo4", dataEncerramento: "2020-01-01" }, // encerrado no passado
    { numeroControlePNCP: "003", hash: "hash_novo3", dataEncerramento: "2026-12-01" }  // duplicata no lote
  ];

  console.log("1. Testando admissão 'abertas'...");
  const resAbertas = simularMergeEmMemoria({
    linhasExistentes: baseExistente,
    loteEntrada: lote,
    politicaAdmissao: 'abertas'
  });

  assert.strictEqual(resAbertas.recebidos, 5, "Recebidos deve ser 5");
  assert.strictEqual(resAbertas.novos, 1, "Apenas 003 é novo admitido");
  assert.strictEqual(resAbertas.atualizados, 1, "Apenas 001 foi atualizado");
  assert.strictEqual(resAbertas.ignorados, 1, "002 foi ignorado");
  assert.strictEqual(resAbertas.naoAdmitidos, 2, "004 (encerrado) e a duplicata de 003 não foram admitidos");
  console.log("   [OK] Política 'abertas' filtrou corretamente sem perder dados");

  console.log("2. Testando admissão 'todas'...");
  const resTodas = simularMergeEmMemoria({
    linhasExistentes: baseExistente,
    loteEntrada: lote,
    politicaAdmissao: 'todas'
  });

  assert.strictEqual(resTodas.recebidos, 5);
  assert.strictEqual(resTodas.novos, 2, "003 e 004 devem entrar como novos");
  assert.strictEqual(resTodas.atualizados, 1);
  assert.strictEqual(resTodas.ignorados, 1);
  assert.strictEqual(resTodas.naoAdmitidos, 1, "Apenas a duplicata no lote foi deduplicada");
  console.log("   [OK] Política 'todas' importou todos os registros válidos");

  console.log("\n>>> TODOS OS TESTES DA LÓGICA DE MERGE PASSARAM COM SUCESSO! <<<");
}

executarTestesMerge();
