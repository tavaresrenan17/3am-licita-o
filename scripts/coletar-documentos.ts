/**
 * Esvazia a fila de documentos pela linha de comando, com o código de produção.
 *
 * A tela de Sincronização faz o mesmo, mas exige a aba aberta do começo ao fim.
 * Para a carga inicial do catálogo — centenas de licitações, minutos de coleta —
 * é mais confortável rodar aqui.
 *
 *   npm run coletar:documentos
 *   npm run coletar:documentos -- 50     (para só 50 licitações)
 *
 * Retomável: cada tick deixa a fila em estado consistente, então interromper com
 * Ctrl+C não perde o que já foi gravado nem prende licitação em 'coletando'.
 */
import { readFileSync } from "node:fs";

function carregarEnv() {
  const texto = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const linha of texto.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
    const chave = m?.[1];
    const valor = m?.[2];
    if (chave && valor !== undefined) {
      process.env[chave] = valor.replace(/^["']|["']$/g, "");
    }
  }
}

const numeroBR = (n: number) => n.toLocaleString("pt-BR");

async function main() {
  carregarEnv();

  const limiteArg = Number(process.argv[2]);
  const limiteTotal = Number.isInteger(limiteArg) && limiteArg > 0 ? limiteArg : Infinity;

  const repo = await import("../src/services/pncp/repositorio.server");
  const { executarTickDocumentos } = await import("../src/services/pncp/worker.documentos.server");

  const cfg = await repo.obterConfiguracoes();
  const antes = (await repo.coberturaDocumentos()) as unknown as Record<string, number>;

  const faltam = antes["elegiveis"]! - antes["completas"]! - antes["com_erro"]!;
  console.log(
    `Fila: ${numeroBR(faltam)} licitações a coletar ` +
      `(${numeroBR(antes["completas"]!)} de ${numeroBR(antes["elegiveis"]!)} já coletadas).`,
  );
  if (faltam <= 0) {
    console.log("Nada a fazer.");
    return;
  }

  // 2 partidas por segundo é o limite da nossa aplicação (arquivo 03 §8), então
  // a estimativa é simplesmente meio segundo por licitação.
  console.log(
    `Estimativa: ~${Math.ceil(Math.min(faltam, limiteTotal) / 2 / 60)} min no limite de 2 req/s.\n`,
  );

  const inicio = Date.now();
  let licitacoes = 0;
  let documentos = 0;
  let semAnexo = 0;
  const erros: string[] = [];

  for (let tick = 1; licitacoes < limiteTotal; tick++) {
    const resumo = await executarTickDocumentos({
      banco: repo.portaDocumentos(),
      cfg: {
        palavras_chave: cfg.palavras_chave,
        score_peso_palavras: cfg.score_peso_palavras,
        score_peso_documentos: cfg.score_peso_documentos,
        score_peso_valor: cfg.score_peso_valor,
      },
      // Fora do runtime de borda não há limite de requisição para respeitar:
      // o tick pode ser longo, o que reduz idas e voltas ao banco.
      orcamentoMs: 300_000,
      maxLicitacoesPorTick: Math.min(200, limiteTotal - licitacoes),
    });

    licitacoes += resumo.licitacoesProcessadas;
    documentos += resumo.documentosGravados;
    semAnexo += resumo.semDocumentos;
    erros.push(...resumo.erros);

    console.log(
      `tick ${tick}: +${resumo.licitacoesProcessadas} licitações, ` +
        `+${resumo.documentosGravados} documentos — acumulado ${numeroBR(licitacoes)} em ` +
        `${Math.round((Date.now() - inicio) / 1000)}s`,
    );
    if (resumo.erros.length > 0) {
      console.log(`  ${resumo.erros.length} erro(s), primeiro: ${resumo.erros[0]}`);
    }

    if (resumo.filaVazia) {
      console.log("\nFila vazia.");
      break;
    }

    // Tick sem avanço e com erro é fonte degradada: parar e deixar retomável.
    if (resumo.licitacoesProcessadas === 0 && resumo.erros.length > 0) {
      console.log("\nInterrompido: a fonte não respondeu neste tick. Rodar de novo retoma daqui.");
      break;
    }
  }

  const depois = (await repo.coberturaDocumentos()) as unknown as Record<string, number>;
  console.log(
    `\nResultado em ${Math.round((Date.now() - inicio) / 1000)}s: ` +
      `${numeroBR(licitacoes)} licitações, ${numeroBR(documentos)} documentos, ` +
      `${numeroBR(semAnexo)} sem anexo no PNCP, ${erros.length} erro(s).`,
  );
  console.log(
    `Cobertura: ${numeroBR(depois["completas"]!)} de ${numeroBR(depois["elegiveis"]!)} ` +
      `(${numeroBR(depois["documentos_total"]!)} documentos · ` +
      `${numeroBR(depois["com_edital"]!)} com edital · ` +
      `${numeroBR(depois["com_projeto"]!)} com projeto · ` +
      `${numeroBR(depois["com_orcamento"]!)} com orçamento · ` +
      `${numeroBR(depois["com_erro"]!)} com falha)`,
  );

  if (erros.length > 0) {
    console.log("\nAmostra de erros:");
    for (const e of erros.slice(0, 5)) console.log(`  ${e}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
