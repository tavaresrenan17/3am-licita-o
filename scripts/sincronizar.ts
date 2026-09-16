/**
 * Ciclo completo de sincronização pela linha de banda — sem aba aberta.
 *
 * Fecha a lacuna I17 do arquivo 05: até aqui os ticks eram conduzidos pelo
 * navegador, então fechar a aba parava a coleta e nada rodava sozinho.
 *
 *   npm run sincronizar                  # descoberta (propostas abertas)
 *   npm run sincronizar -- incremental   # atualização do que já está salvo
 *   npm run sincronizar -- descoberta --documentos
 *
 * O recorte vem das Configurações, mas pode ser sobrescrito para um teste curto
 * ou uma coleta pontual, sem mexer no que a rotina noturna usa:
 *
 *   npm run sincronizar -- --uf DF --horizonte 2
 *   npm run sincronizar -- incremental --uf DF --modalidades 4,6
 *
 * Para rodar sozinho, agendar este comando (Agendador de Tarefas do Windows,
 * cron, ou Cloudflare Cron Trigger quando o app for publicado). O script é
 * seguro para reexecutar: se encontrar um job em andamento ele RETOMA em vez de
 * abrir outro, e o índice único do banco impede dois ciclos concorrentes.
 */
import { existsSync, readFileSync } from "node:fs";

function carregarEnv() {
  const arquivo = new URL("../.env", import.meta.url);
  // Em desenvolvimento usamos `.env`; em produção (GitHub Actions) os valores
  // chegam como secrets no ambiente e o arquivo não existe.
  if (!existsSync(arquivo)) return;

  const texto = readFileSync(arquivo, "utf8");
  for (const linha of texto.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
    const chave = m?.[1];
    const valor = m?.[2];
    // Um secret fornecido pelo ambiente sempre prevalece sobre o arquivo local.
    if (chave && valor !== undefined && process.env[chave] === undefined) {
      process.env[chave] = valor.replace(/^["']|["']$/g, "");
    }
  }
}

const numeroBR = (n: number) => n.toLocaleString("pt-BR");
const agoraHM = () => new Date().toLocaleTimeString("pt-BR");
const log = (msg: string) => console.log(`[${agoraHM()}] ${msg}`);

async function main() {
  carregarEnv();

  const args = process.argv.slice(2);
  const modo = args.includes("incremental") ? "incremental" : "descoberta";
  const comDocumentos = args.includes("--documentos");

  /** Valor de `--chave valor`, ou undefined se a flag não veio. */
  const opcao = (nome: string) => {
    const i = args.indexOf(`--${nome}`);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const ufArg = opcao("uf");
  const horizonteArg = Number(opcao("horizonte"));
  const modalidadesArg = opcao("modalidades")
    ?.split(",")
    .map((m) => Number(m.trim()))
    .filter((m) => Number.isInteger(m) && m > 0);

  const repo = await import("../src/services/pncp/repositorio.server");
  const { executarTick } = await import("../src/services/pncp/worker.server");
  const planner = await import("../src/services/pncp/planner");

  const cfg = await repo.obterConfiguracoes();
  const escoreCfg = {
    palavras_chave: cfg.palavras_chave,
    score_peso_palavras: cfg.score_peso_palavras,
    score_peso_documentos: cfg.score_peso_documentos,
    score_peso_valor: cfg.score_peso_valor,
  };

  // Retomar é sempre melhor que abrir outro job: o anterior guarda o checkpoint
  // de cada segmento, e abrir um novo recomeçaria a paginação do zero.
  let job = await repo.jobEmAndamento();
  if (job) {
    log(`Retomando job ${job.tipo} em andamento: ${job.descricao_escopo}`);
  } else if (modo === "incremental") {
    const inicioPadrao = await repo.inicioPadraoIncremental();
    if (!inicioPadrao) {
      log("Nenhuma carga inicial registrada. Rode a descoberta antes do incremental.");
      process.exit(1);
    }

    // A rota de atualização exige modalidade: "todas" tem de virar a lista real.
    let modalidades = modalidadesArg ?? cfg.modalidades_coleta;
    if (modalidades.length === 0) {
      modalidades = (await repo.listarModalidades()).filter((m) => m.ativo).map((m) => m.id);
    }

    const escopo = {
      ufs: ufArg ? [ufArg.toUpperCase()] : cfg.ufs_coleta,
      modalidades,
      inicioPadrao,
    };
    const segmentos = planner.planejarIncremental(
      escopo,
      await repo.listarCoberturaIncremental(),
      new Date(),
    );
    if (segmentos.length === 0) {
      log("Nada a atualizar: todas as partições já estão na fronteira de hoje.");
      return;
    }

    log(
      `Planejado: ${segmentos.length} janela(s) — ${planner.descreverIncremental(escopo, segmentos.length)}`,
    );
    job = await repo.criarSincronizacao(
      escopo,
      planner.descreverIncremental(escopo, segmentos.length),
      segmentos,
      { tipo: "incremental", cutoff: new Date().toISOString() },
    );
  } else {
    const escopo = {
      ufs: ufArg ? [ufArg.toUpperCase()] : cfg.ufs_coleta,
      modalidades: modalidadesArg ?? cfg.modalidades_coleta,
      horizonteDias:
        Number.isInteger(horizonteArg) && horizonteArg > 0 ? horizonteArg : cfg.horizonte_dias,
    };
    const segmentos = planner.planejarPropostasAbertas(escopo);
    log(`Planejado: ${segmentos.length} segmento(s) — ${planner.descreverEscopo(escopo)}`);
    job = await repo.criarSincronizacao(escopo, planner.descreverEscopo(escopo), segmentos);
  }

  let concluido = false;
  let manterParaRetomada = false;
  let motivo = "Encerrada pelo agendador sem concluir";
  const total = { paginas: 0, recebidos: 0, novos: 0, atualizados: 0, naoAdmitidos: 0 };
  const inicio = Date.now();
  const limiteExecucaoMs = Number(process.env["SYNC_MAX_RUNTIME_MS"] ?? 0);

  try {
    // Teto de segurança: nunca laçar indefinidamente atrás de um conjunto que
    // pode estar mudando na fonte.
    for (let volta = 1; volta <= 400; volta++) {
      if (limiteExecucaoMs > 0 && Date.now() - inicio >= limiteExecucaoMs) {
        motivo = "Janela do agendador encerrada; a próxima execução retomará o checkpoint";
        manterParaRetomada = true;
        log("Janela de execução atingida. O próximo agendamento retomará deste checkpoint.");
        break;
      }

      const resumo = await executarTick(job.id, {
        banco: repo.portaIngestao(),
        cfg: escoreCfg,
        // Fora do runtime de borda não há limite de requisição a respeitar: o
        // tick pode ser longo, o que reduz idas e voltas ao banco. O ritmo
        // contra o PNCP continua vindo de `intervaloPartidaMs`.
        orcamentoMs: 600_000,
        reservaMs: 90_000,
      });

      total.paginas += resumo.paginasAplicadas;
      total.recebidos += resumo.recebidos;
      total.novos += resumo.novos;
      total.atualizados += resumo.atualizados;
      total.naoAdmitidos += resumo.naoAdmitidos;

      log(
        `tick ${volta}: ${resumo.paginasAplicadas} págs · ${resumo.recebidos} recebidos · ` +
          `${resumo.novos} novas · ${resumo.atualizados} atualizadas` +
          ` · PNCP ${resumo.metricasApi.requisicoes} req / ${resumo.metricasApi.tentativas} tentativa(s)` +
          (resumo.metricasApi.requisicoes > 0
            ? ` · média ${Math.round(resumo.metricasApi.latenciaTotalMs / resumo.metricasApi.requisicoes)} ms`
            : "") +
          (resumo.naoAdmitidos > 0 ? ` · ${resumo.naoAdmitidos} não admitidas` : "") +
          (resumo.erros.length > 0 ? ` · ${resumo.erros.length} erro(s)` : ""),
      );
      if (resumo.erros.length > 0) log(`  primeiro erro: ${resumo.erros[0]}`);

      if (resumo.jobConcluido) {
        concluido = true;
        break;
      }

      // Tick sem avanço e com erro é fonte degradada: parar e deixar retomável,
      // em vez de insistir contra um serviço instável.
      if (resumo.paginasAplicadas === 0 && resumo.erros.length > 0) {
        motivo = `Fonte instável: ${resumo.erros[0] ?? "falha na coleta"}`;
        manterParaRetomada = true;
        log("Encerrando: a fonte não respondeu neste tick. Rodar de novo retoma daqui.");
        break;
      }
    }
  } catch (e) {
    motivo = e instanceof Error ? e.message : "Falha ao sincronizar";
    log(`ERRO: ${motivo}`);
  } finally {
    // Falha transitória mantém o job ativo de propósito: a próxima execução
    // encontra o mesmo ID e retoma o checkpoint. Interrupções definitivas ou o
    // teto do laço liberam o single-flight marcando o job como parcial.
    if (!concluido && !manterParaRetomada) {
      await repo.marcarJobParcial(job.id, motivo.slice(0, 300));
    }
  }

  // A fronteira de cobertura só avança quando o ciclo fecha de verdade.
  if (concluido && job.tipo === "incremental") {
    const particoes = await repo.avancarCobertura(job.id);
    log(`Cobertura avançada em ${particoes} partição(ões).`);
  }

  log(
    `${concluido ? "Concluído" : manterParaRetomada ? "Aguardando retomada" : "Parcial"} em ${Math.round((Date.now() - inicio) / 1000)}s: ` +
      `${numeroBR(total.paginas)} págs, ${numeroBR(total.recebidos)} recebidos, ` +
      `${numeroBR(total.novos)} novas, ${numeroBR(total.atualizados)} atualizadas` +
      (total.naoAdmitidos > 0 ? `, ${numeroBR(total.naoAdmitidos)} não admitidas` : ""),
  );

  if (comDocumentos) {
    log("Coletando documentos das licitações pendentes…");
    const { executarTickDocumentos } =
      await import("../src/services/pncp/worker.documentos.server");
    let licitacoes = 0;
    let documentos = 0;
    for (let volta = 1; volta <= 400; volta++) {
      const r = await executarTickDocumentos({
        banco: repo.portaDocumentos(),
        cfg: escoreCfg,
        orcamentoMs: 300_000,
      });
      licitacoes += r.licitacoesProcessadas;
      documentos += r.documentosGravados;
      if (r.filaVazia) break;
      if (r.licitacoesProcessadas === 0 && r.erros.length > 0) {
        log(`Coleta de documentos interrompida: ${r.erros[0]}`);
        break;
      }
    }
    log(`Documentos: ${numeroBR(licitacoes)} licitações, ${numeroBR(documentos)} arquivos.`);
  }

  // O agendador precisa distinguir uma coleta concluída de outra que ficou
  // aguardando retomada. O código 75 representa indisponibilidade temporária.
  if (!concluido) process.exitCode = manterParaRetomada ? 75 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
