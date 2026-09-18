/**
 * Esvazia a fila de embeddings: vetoriza o objeto das licitações e os trechos
 * dos editais já extraídos.
 *
 *   npm run gerar:embeddings
 *   npm run gerar:embeddings -- 500    (para depois de ~500 vetores)
 *
 * Exige Ollama rodando com o modelo bge-m3:
 *   ollama serve  &&  ollama pull bge-m3
 *
 * Retomável: o que decide o que falta é o hash do texto de origem, então
 * interromper e rodar de novo continua exatamente de onde parou.
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

  const { OllamaEmbedder } = await import("../src/services/busca/embedder");
  const repo = await import("../src/services/busca/repositorio.embeddings.server");
  const { executarTickEmbeddings } = await import("../src/services/busca/worker.embeddings.server");

  const embedder = new OllamaEmbedder();

  // Falhar cedo e claro: sem provedor, não há o que fazer.
  try {
    await embedder.embed(["teste de conexão"]);
  } catch (e) {
    console.error(
      `Provedor de embedding indisponível: ${e instanceof Error ? e.message : String(e)}`,
    );
    console.error("Suba o Ollama com `ollama serve` e garanta `ollama pull bge-m3`.");
    process.exit(1);
  }

  const antes = await repo.coberturaEmbeddings();
  console.log(
    `Licitações: ${numeroBR(antes["licitacoes_com_embedding"] ?? 0)} de ${numeroBR(antes["licitacoes_pesquisaveis"] ?? 0)} vetorizadas.\n` +
      `Documentos: ${numeroBR(antes["documentos_vetorizados"] ?? 0)} de ${numeroBR(antes["documentos_com_texto"] ?? 0)} com texto, ` +
      `${numeroBR(antes["chunks"] ?? 0)} chunks.\n`,
  );

  const banco = repo.portaEmbeddingsSupabase(embedder.modelo);
  const inicio = Date.now();
  let feitos = 0;

  while (feitos < limiteTotal) {
    const resumo = await executarTickEmbeddings({ banco, embedder });
    if (resumo.filaVazia) {
      console.log("Fila vazia.");
      break;
    }
    feitos += resumo.licitacoes + resumo.chunks;
    console.log(
      `+${resumo.licitacoes} licitações, +${resumo.documentos} documentos (${resumo.chunks} chunks) — ${numeroBR(feitos)} vetores`,
    );
    for (const e of resumo.erros.slice(0, 3)) console.log(`   ! ${e}`);
  }

  const depois = await repo.coberturaEmbeddings();
  const cobertura =
    (depois["licitacoes_com_embedding"] ?? 0) / Math.max(depois["licitacoes_pesquisaveis"] ?? 1, 1);
  console.log(
    `\nConcluído em ${Math.round((Date.now() - inicio) / 1000)}s. ` +
      `Cobertura de licitações: ${(cobertura * 100).toFixed(2)}% ` +
      `(a ADR-001 exige ≥ 99% antes de ligar o híbrido).`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
