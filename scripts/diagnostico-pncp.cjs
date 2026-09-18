const fs = require('fs');

async function testarPncp() {
  console.log("=== INICIANDO TESTES DIAGNÓSTICOS DA API DO PNCP ===");
  const testes = [];

  // Teste 1: Limite de tamanho de página
  try {
    const start = performance.now();
    const res = await fetch("https://pncp.gov.br/api/consulta/v1/contratacoes/proposta?dataFinal=20261015&uf=SP&pagina=1&tamanhoPagina=51", {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(20000)
    });
    const ms = Math.round(performance.now() - start);
    const text = await res.text();
    testes.push({
      teste: "tamanhoPagina=51 (excedendo teto de 50)",
      status: res.status,
      duracaoMs: ms,
      respostaTrecho: text.slice(0, 300)
    });
  } catch (err) {
    testes.push({ teste: "tamanhoPagina=51", erro: err.message });
  }

  // Teste 2: Consulta sem modalidade na rota /publicacao vs /proposta
  try {
    const start = performance.now();
    const res = await fetch("https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?dataInicial=20260910&dataFinal=20260910&uf=SP&pagina=1&tamanhoPagina=10", {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(20000)
    });
    const ms = Math.round(performance.now() - start);
    const text = await res.text();
    testes.push({
      teste: "publicacao sem codigoModalidadeContratacao",
      status: res.status,
      duracaoMs: ms,
      respostaTrecho: text.slice(0, 300)
    });
  } catch (err) {
    testes.push({ teste: "publicacao sem modalidade", erro: err.message });
  }

  // Teste 3: Consulta incremental /atualizacao válida
  try {
    const start = performance.now();
    const res = await fetch("https://pncp.gov.br/api/consulta/v1/contratacoes/atualizacao?dataInicial=20260915&dataFinal=20260916&codigoModalidadeContratacao=6&uf=SP&pagina=1&tamanhoPagina=10", {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(30000)
    });
    const ms = Math.round(performance.now() - start);
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch {}
    testes.push({
      teste: "atualizacao_valida (SP, mod 6, 2 dias)",
      status: res.status,
      duracaoMs: ms,
      totalRegistros: json?.totalRegistros,
      totalPaginas: json?.totalPaginas,
      itensRecebidos: json?.data?.length,
      respostaTrecho: text.slice(0, 250)
    });
  } catch (err) {
    testes.push({ teste: "atualizacao_valida", erro: err.message });
  }

  // Teste 4: Rota de propostas /proposta (latência real e consistência de envelope)
  try {
    const start = performance.now();
    const res = await fetch("https://pncp.gov.br/api/consulta/v1/contratacoes/proposta?dataFinal=20261015&uf=SP&pagina=1&tamanhoPagina=20", {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(45000)
    });
    const ms = Math.round(performance.now() - start);
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch {}
    testes.push({
      teste: "proposta_valida (SP, 20 itens)",
      status: res.status,
      duracaoMs: ms,
      totalRegistros: json?.totalRegistros,
      totalPaginas: json?.totalPaginas,
      itensRecebidos: json?.data?.length,
      amostraItem: json?.data?.[0] ? {
        numeroControlePNCP: json.data[0].numeroControlePNCP,
        objeto: json.data[0].objeto?.slice(0, 60),
        dataAbertura: json.data[0].dataAberturaProposta,
        dataEncerramento: json.data[0].dataEncerramentoProposta,
        situacao: json.data[0].situacaoCompraNome
      } : null
    });
  } catch (err) {
    testes.push({ teste: "proposta_valida", erro: err.message });
  }

  // Teste 5: Concorrência simultânea (3 requisições paralelas)
  try {
    const start = performance.now();
    const promises = [1, 2, 3].map(async (pg) => {
      const pStart = performance.now();
      const res = await fetch(`https://pncp.gov.br/api/consulta/v1/contratacoes/proposta?dataFinal=20261015&uf=DF&pagina=${pg}&tamanhoPagina=10`, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(35000)
      });
      const dur = Math.round(performance.now() - pStart);
      return { pagina: pg, status: res.status, ms: dur };
    });
    const resultadosParalelos = await Promise.all(promises);
    const msTotal = Math.round(performance.now() - start);
    testes.push({
      teste: "concorrencia_3_chamadas_paralelas",
      duracaoTotalMs: msTotal,
      detalhes: resultadosParalelos
    });
  } catch (err) {
    testes.push({ teste: "concorrencia_3_chamadas_paralelas", erro: err.message });
  }

  // Teste 6: Endpoint de arquivos de compra inexistente / não encontrada
  try {
    const start = performance.now();
    const res = await fetch("https://pncp.gov.br/api/consulta/v1/orgaos/00000000000000/compras/2026/1/arquivos", {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(20000)
    });
    const ms = Math.round(performance.now() - start);
    const text = await res.text();
    testes.push({
      teste: "arquivos_inexistentes",
      status: res.status,
      duracaoMs: ms,
      respostaTrecho: text.slice(0, 200)
    });
  } catch (err) {
    testes.push({ teste: "arquivos_inexistentes", erro: err.message });
  }

  console.log(JSON.stringify(testes, null, 2));
}

testarPncp();
