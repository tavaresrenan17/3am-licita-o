import { performance } from 'node:perf_hooks';

const hoje = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

function calcularDataFinal(dias) {
  const d = new Date(hoje + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10).replaceAll('-', '');
}

async function testarConsulta(nome, params) {
  const url = new URL('https://pncp.gov.br/api/consulta/v1/contratacoes/proposta');
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, String(v));
    }
  }

  const inicio = performance.now();
  let resultado = {
    nome,
    url: url.toString(),
    status: 0,
    tempoMs: 0,
    totalRegistros: 0,
    totalPaginas: 0,
    registrosPagina: 0,
    tamanhoKb: 0,
    erro: null,
  };

  try {
    const resposta = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 3AM-Licitacao/1.0',
      },
      signal: AbortSignal.timeout(30000),
    });

    resultado.status = resposta.status;
    resultado.tempoMs = Math.round(performance.now() - inicio);

    const texto = await resposta.text();
    resultado.tamanhoKb = (Buffer.byteLength(texto) / 1024).toFixed(1);

    if (resposta.ok) {
      const dados = JSON.parse(texto);
      resultado.totalRegistros = dados.totalRegistros ?? 0;
      resultado.totalPaginas = dados.totalPaginas ?? 0;
      resultado.registrosPagina = Array.isArray(dados.data) ? dados.data.length : 0;
    } else {
      resultado.erro = `HTTP ${resposta.status}: ${texto.slice(0, 150)}`;
    }
  } catch (err) {
    resultado.tempoMs = Math.round(performance.now() - inicio);
    resultado.erro = err.message || String(err);
  }

  return resultado;
}

async function rodarBenchmark() {
  console.log(`=== INICIANDO BENCHMARK DA API NATIVA DO PNCP (${hoje}) ===\n`);

  const cenarios = [
    { dias: 5, rotulo: '5 dias (Urgentes)' },
    { dias: 15, rotulo: '15 dias (Próximas 2 semanas)' },
    { dias: 30, rotulo: '30 dias (Mês completo)' },
  ];

  const relatorio = [];

  // Teste 1: Consulta por UF=SP com Modalidade 6 (Pregão Eletrônico, tamanhoPagina 20)
  console.log('--- TESTE A: Pregão Eletrônico (Modalidade 6, UF SP) ---');
  for (const c of cenarios) {
    const dataFinal = calcularDataFinal(c.dias);
    console.log(`Testando ${c.rotulo} (até ${dataFinal})...`);
    const res = await testarConsulta(`Pregão Eletrônico (Mod. 6) · ${c.rotulo}`, {
      uf: 'SP',
      codigoModalidadeContratacao: 6,
      dataFinal,
      pagina: 1,
      tamanhoPagina: 20,
    });
    console.log(` -> Status: ${res.status} | Tempo: ${res.tempoMs}ms | Registros: ${res.totalRegistros} | Págs: ${res.totalPaginas}`);
    relatorio.push({ ...res, dias: c.dias, modalidade: 'Pregão Eletrônico (6)' });
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Teste 2: Consulta por UF=SP com Modalidade 8 (Dispensa de Licitação, tamanhoPagina 50)
  console.log('\n--- TESTE B: Dispensa de Licitação (Modalidade 8, UF SP) ---');
  for (const c of cenarios) {
    const dataFinal = calcularDataFinal(c.dias);
    console.log(`Testando ${c.rotulo} (até ${dataFinal})...`);
    const res = await testarConsulta(`Dispensa (Mod. 8) · ${c.rotulo}`, {
      uf: 'SP',
      codigoModalidadeContratacao: 8,
      dataFinal,
      pagina: 1,
      tamanhoPagina: 50,
    });
    console.log(` -> Status: ${res.status} | Tempo: ${res.tempoMs}ms | Registros: ${res.totalRegistros} | Págs: ${res.totalPaginas}`);
    relatorio.push({ ...res, dias: c.dias, modalidade: 'Dispensa (8)' });
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Teste 3: Consulta Geral por UF=SP (Sem modalidade, tamanhoPagina 50)
  console.log('\n--- TESTE C: Geral / Todas as Modalidades (UF SP) ---');
  for (const c of cenarios) {
    const dataFinal = calcularDataFinal(c.dias);
    console.log(`Testando ${c.rotulo} (até ${dataFinal})...`);
    const res = await testarConsulta(`Geral (Todas) · ${c.rotulo}`, {
      uf: 'SP',
      dataFinal,
      pagina: 1,
      tamanhoPagina: 50,
    });
    console.log(` -> Status: ${res.status} | Tempo: ${res.tempoMs}ms | Registros: ${res.totalRegistros} | Págs: ${res.totalPaginas}`);
    relatorio.push({ ...res, dias: c.dias, modalidade: 'Geral (Todas)' });
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log('\n=== RESULTADO COMPLETO (JSON) ===');
  console.log(JSON.stringify(relatorio, null, 2));
}

rodarBenchmark();
