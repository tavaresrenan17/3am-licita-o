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

  // Trava antes de qualquer trabalho. O Ollama é uma pista só: medido em
  // 18/09/2026, uma chamada de 123 ms com o serviço ocioso levou de 817 ms a
  // 8.765 ms enquanto outro job rodava. Dois processos aqui não dividem o
  // trabalho — multiplicam o tempo dos dois e ainda martelam o Supabase com
  // reservas concorrentes.
  const dono = `${process.env["COMPUTERNAME"] ?? "local"}:${process.pid}`;
  // 15 min, e nao 5: um tick pode levar 5 editais x 40 chunks x ~2,5 s = ~8 min
  // quando o Ollama esta degradado. Lease mais curto que o pior tick vence no
  // meio do trabalho e deixa outro processo entrar -- exatamente o que ele
  // existe para impedir.
  const DURACAO_LEASE = "15 minutes";
  if (!(await repo.adquirirLeaseEmbedding(dono, DURACAO_LEASE))) {
    console.error("Já existe um job de embeddings rodando (lease em uso).");
    console.error("Espere ele terminar — rodar dois ao mesmo tempo deixa os dois mais lentos.");
    process.exit(1);
  }

  let leaseAtivo = true;
  const soltarLease = async () => {
    if (!leaseAtivo) return;
    leaseAtivo = false;
    await repo.liberarLeaseEmbedding(dono).catch(() => {});
  };
  // Ctrl+C precisa devolver a trava; sem isso o próximo job espera o prazo
  // inteiro por causa de uma interrupção manual.
  process.on("SIGINT", () => {
    void soltarLease().then(() => process.exit(130));
  });

  // O corte "recomendada" e configuravel na tela. Ler o valor real evita que a
  // prioridade da fila discorde em silencio do que a interface chama de
  // recomendada no dia em que a equipe ajustar o numero.
  const cfgRepo = await import("../src/services/pncp/repositorio.server");
  const cfg = await cfgRepo.obterConfiguracoes();

  // try/finally: QUALQUER saida — excecao dentro do tick, falha ao ler a
  // cobertura, erro de rede na renovacao — precisa devolver a trava. Sem isso o
  // proximo job espera o prazo inteiro por causa de um erro que ja terminou.
  try {
    const banco = repo.portaEmbeddingsSupabase(embedder.modelo, cfg.score_minimo_recomendado);
    const inicio = Date.now();
    let feitos = 0;
    // Renovar a cada 2 min mantem a posse com folga sobre o lease de 15 min, sem
    // transformar uma queda do processo em fila travada para sempre.
    let ultimaRenovacao = Date.now();

    // `filaVazia` é propriedade da FILA, não de sucesso: `executarTickEmbeddings`
    // engole toda falha em `resumo.erros` e devolve normal. Com o provedor fora do
    // ar, cada volta reserva o mesmo lote, falha inteira e devolve zero vetores —
    // o laço nunca sairia, martelando o Supabase com reservas idênticas.
    // Três ticks seguidos sem UM vetor gravado é isso acontecendo. Abortamos e
    // devolvemos a decisão ao operador: nada de backoff nem retry aqui, porque o
    // script é retomável e rodar de novo continua de onde parou.
    const MAX_TICKS_SEM_PROGRESSO = 3;
    let ticksSemProgresso = 0;

    while (feitos < limiteTotal) {
      if (Date.now() - ultimaRenovacao > 120_000) {
        // Se a renovacao for RECUSADA, o lease venceu e outro processo tomou.
        // Continuar seria rodar sem posse -- os dois jobs simultaneos que a
        // trava existe para evitar, agora sem ninguem perceber.
        if (!(await repo.adquirirLeaseEmbedding(dono, DURACAO_LEASE))) {
          console.error("Perdi o lease: outro job de embeddings assumiu a fila. Encerrando.");
          console.error("A fila e retomavel; rode de novo quando o outro terminar.");
          return;
        }
        ultimaRenovacao = Date.now();
      }

      const resumo = await executarTickEmbeddings({ banco, embedder });
      if (resumo.filaVazia) {
        console.log("Fila vazia.");
        break;
      }
      // Documento fechado como `sem_texto` conta como progresso: não virou vetor,
      // mas saiu da fila e não volta. Sem isso, um lote inteiro de PDFs
      // escaneados pareceria um provedor travado.
      const progresso = resumo.licitacoes + resumo.chunks + resumo.semTexto;
      feitos += resumo.licitacoes + resumo.chunks;
      console.log(
        `+${resumo.licitacoes} licitações, +${resumo.documentos} documentos (${resumo.chunks} chunks)` +
          `${resumo.semTexto > 0 ? `, ${resumo.semTexto} sem texto aproveitável` : ""} — ${numeroBR(feitos)} vetores`,
      );
      for (const e of resumo.erros.slice(0, 3)) console.log(`   ! ${e}`);

      ticksSemProgresso = progresso === 0 ? ticksSemProgresso + 1 : 0;
      if (ticksSemProgresso >= MAX_TICKS_SEM_PROGRESSO) {
        console.error(
          `\n${MAX_TICKS_SEM_PROGRESSO} ticks seguidos sem gravar nenhum vetor, com fila não vazia. ` +
            `Último tick: ${resumo.erros.length} erro(s).`,
        );
        if (resumo.erros[0]) console.error(`Primeiro erro: ${resumo.erros[0]}`);
        console.error(
          "Interrompendo. O provedor de embedding provavelmente caiu — confira `ollama serve` " +
            "e rode de novo: a fila é retomável e continua de onde parou.",
        );
        // Soltar a trava antes de sair, senão o próximo job espera o prazo
        // inteiro por causa de uma falha que já terminou.
        await soltarLease();
        process.exit(1);
      }
    }

    await soltarLease();

    const depois = await repo.coberturaEmbeddings();
    const cobertura =
      (depois["licitacoes_com_embedding"] ?? 0) /
      Math.max(depois["licitacoes_pesquisaveis"] ?? 1, 1);
    console.log(
      `\nConcluído em ${Math.round((Date.now() - inicio) / 1000)}s. ` +
        `Cobertura de licitações: ${(cobertura * 100).toFixed(2)}% ` +
        `(a ADR-001 exige ≥ 99% antes de ligar o híbrido).`,
    );
  } finally {
    await soltarLease();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
