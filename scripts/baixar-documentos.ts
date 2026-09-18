/**
 * Esvazia a fila de arquivos: baixa o PDF de cada documento catalogado e
 * guarda o texto extraído.
 *
 *   npm run baixar:documentos
 *   npm run baixar:documentos -- 50     (para só 50 arquivos)
 *
 * Retomável: cada tick deixa a fila consistente, e Ctrl+C não perde o que já
 * foi gravado. Arquivo acima do teto e formato não suportado são estados
 * definitivos — não voltam para a fila.
 */
import { readFileSync } from "node:fs";

function carregarEnv() {
  const texto = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const linha of texto.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
    const chave = m?.[1];
    const valor = m?.[2];
    if (chave && valor !== undefined) process.env[chave] = valor.replace(/^["']|["']$/g, "");
  }
}

const numeroBR = (n: number) => n.toLocaleString("pt-BR");

async function main() {
  carregarEnv();

  const limiteArg = Number(process.argv[2]);
  const limiteTotal = Number.isInteger(limiteArg) && limiteArg > 0 ? limiteArg : Infinity;

  const repo = await import("../src/services/documentos/repositorio.arquivos.server");
  const { executarTickArquivos } =
    await import("../src/services/documentos/worker.arquivos.server");

  const antes = await repo.coberturaArquivos();
  const prontos =
    antes["extraido"]! + antes["sem_texto"]! + antes["grande_demais"]! + antes["erro"]!;
  const faltam = antes["total"]! - prontos;

  console.log(
    `Fila: ${numeroBR(faltam)} arquivos a baixar (${numeroBR(prontos)} de ${numeroBR(antes["total"]!)} já processados).`,
  );
  if (faltam <= 0) {
    console.log("Nada a fazer.");
    return;
  }
  console.log(
    `Estimativa: ~${Math.ceil(Math.min(faltam, limiteTotal) / 2 / 60)} min no limite de 2 partidas/s.\n`,
  );

  const banco = repo.portaArquivosSupabase();
  const inicio = Date.now();
  let processados = 0;

  while (processados < limiteTotal) {
    const resumo = await executarTickArquivos({ banco });
    if (resumo.filaVazia) {
      console.log("Fila vazia.");
      break;
    }
    processados += resumo.processados;
    console.log(
      `+${resumo.processados} (texto ${resumo.extraidos}, sem texto ${resumo.semTexto}, ` +
        `grandes ${resumo.grandesDemais}, erros ${resumo.erros.length}) — ${numeroBR(processados)} no total`,
    );
    for (const e of resumo.erros.slice(0, 3)) console.log(`   ! ${e}`);
  }

  const depois = await repo.coberturaArquivos();
  console.log(
    `\nConcluído em ${Math.round((Date.now() - inicio) / 1000)}s. ` +
      `Com texto: ${numeroBR(depois["extraido"]!)}, sem texto: ${numeroBR(depois["sem_texto"]!)}, ` +
      `grandes demais: ${numeroBR(depois["grande_demais"]!)}, erros: ${numeroBR(depois["erro"]!)}.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
