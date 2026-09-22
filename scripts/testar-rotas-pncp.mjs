const rotas = [
  "https://pncp.gov.br",
  "https://pncp.gov.br/api",
  "https://pncp.gov.br/api/consulta",
  "https://pncp.gov.br/api/consulta/v1",
  "https://pncp.gov.br/api/consulta/swagger-ui/index.html",
  "https://pncp.gov.br/api/consulta/v3/api-docs",
  "https://pncp.gov.br/api/pncp/v1/orgaos",
  "https://pncp.gov.br/api/consulta/v1/modalidades",
  "https://pncp.gov.br/api/consulta/v1/contratacoes/proposta?dataFinal=20260923&pagina=1&tamanhoPagina=10&uf=SP",
];

async function testar() {
  for (const url of rotas) {
    const t0 = Date.now();
    try {
      const res = await fetch(url, {
        headers: {
          "Accept": "text/html,application/json,*/*",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(8000),
      });
      const ms = Date.now() - t0;
      console.log(`[${res.status}] (${ms}ms) -> ${url}`);
    } catch (e) {
      const ms = Date.now() - t0;
      console.log(`[ERRO: ${e.name} ${e.message}] (${ms}ms) -> ${url}`);
    }
  }
}

testar();
