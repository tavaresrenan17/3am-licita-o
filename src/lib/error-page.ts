export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>3AM Licitação — Erro ao carregar</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 'Lexend', system-ui, -apple-system, sans-serif; background: #f2f7f7; color: #2d3b44; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; background: #ffffff; border-radius: 0.75rem; border: 1px solid #dce4e8; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
      h1 { font-size: 1.25rem; font-weight: 600; margin: 0 0 0.5rem; color: #2d3b44; }
      p { color: #6b7a84; font-size: 0.875rem; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; font-size: 0.875rem; font-weight: 500; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #255d78; color: #ffffff; }
      .secondary { background: #ffffff; color: #2d3b44; border-color: #dce4e8; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Não foi possível carregar a página</h1>
      <p>Ocorreu uma falha inesperada no carregamento. Tente atualizar ou retorne à página inicial.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Tentar novamente</button>
        <a class="secondary" href="/">Voltar ao início</a>
      </div>
    </div>
  </body>
</html>`;
}
