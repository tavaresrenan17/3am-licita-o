/**
 * SMOKE REAL: PNCP → Supabase, com o código de produção.
 *
 * Não roda na suíte normal: exige SMOKE_PNCP=1. São poucas requisições a um
 * recorte estreito, para confirmar contrato e gravação — nunca teste de carga
 * contra o PNCP (arquivo 05 §7).
 *
 *   $env:SMOKE_PNCP=1; npx vitest run src/services/pncp/smoke.test.ts
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function carregarEnv() {
  const texto = readFileSync(new URL("../../../.env", import.meta.url), "utf8");
  for (const linha of texto.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
    const chave = m?.[1];
    const valor = m?.[2];
    if (chave && valor !== undefined) {
      process.env[chave] = valor.replace(/^["']|["']$/g, "");
    }
  }
}

const ativo = process.env["SMOKE_PNCP"] === "1";

describe.skipIf(!ativo)("smoke real — coleta de propostas abertas no DF", () => {
  it("consulta o PNCP, grava o catálogo e conclui o segmento", async () => {
    carregarEnv();
    expect(process.env["SUPABASE_SERVICE_ROLE_KEY"], "chave de serviço no .env").toBeTruthy();

    const { planejarPropostasAbertas, descreverEscopo } = await import("./planner");
    const repo = await import("./repositorio.server");
    const { executarTick } = await import("./worker.server");
    const { buscarPagina } = await import("./client.server");

    // Recorte estreito de propósito: uma UF, horizonte de um dia e página
    // pequena. A fonte devolveu HTTP 500 na consulta de 50 por página com
    // horizonte de 7 dias, então o smoke pede o mínimo que ainda prova o fluxo.
    const escopo = { ufs: ["DF"], modalidades: [], horizonteDias: 1, tamanhoPagina: 10 };
    const segmentos = planejarPropostasAbertas(escopo);
    expect(segmentos).toHaveLength(1);

    // Quanto a fonte diz que existe nesse recorte, antes de coletar.
    const primeira = await buscarPagina("proposta", {
      ...segmentos[0]!.params,
      pagina: 1,
    });
    const totalFonte = primeira.envelope?.totalRegistros ?? 0;
    const paginasFonte = primeira.envelope?.totalPaginas ?? 0;
    console.log(
      `\nFonte: ${totalFonte} registros em ${paginasFonte} página(s) — ${segmentos[0]!.descricao}`,
    );

    const anterior = await repo.jobEmAndamento();
    if (anterior) await repo.marcarJobParcial(anterior.id, "Substituída pelo smoke");

    const cfg = await repo.obterConfiguracoes();
    const job = await repo.criarSincronizacao(escopo, descreverEscopo(escopo), segmentos);

    let voltas = 0;
    let recebidos = 0;
    let novos = 0;
    let concluido = false;
    let semProgresso = 0;

    while (voltas++ < 12 && !concluido) {
      const resumo = await executarTick(job.id, {
        banco: repo.portaIngestao(),
        cfg: {
          palavras_chave: cfg.palavras_chave,
          score_peso_palavras: cfg.score_peso_palavras,
          score_peso_documentos: cfg.score_peso_documentos,
          score_peso_valor: cfg.score_peso_valor,
        },
        // A fonte levou 30–60 s por página nas medições; com orçamento curto,
        // a primeira tentativa consome tudo e nem o backoff cabe.
        orcamentoMs: 240_000,
      });

      recebidos += resumo.recebidos;
      novos += resumo.novos;
      concluido = resumo.jobConcluido;
      console.log(
        `tick ${voltas}: páginas=${resumo.paginasAplicadas} recebidos=${resumo.recebidos} ` +
          `novos=${resumo.novos} atualizados=${resumo.atualizados} erros=${resumo.erros.length}`,
      );
      if (resumo.erros.length > 0) console.log("  erros:", resumo.erros.slice(0, 3));

      // O PNCP está devolvendo 500 do próprio pool de conexões. Como o job é
      // retomável, um tick sem progresso não encerra o smoke na hora — mas
      // três seguidos significam fonte indisponível, e insistir seria pressão
      // inútil sobre um serviço degradado.
      if (resumo.paginasAplicadas === 0) {
        if (++semProgresso >= 3) break;
        await new Promise((r) => setTimeout(r, 5_000));
      } else {
        semProgresso = 0;
      }
    }

    // Sem isto o job fica preso em "em_andamento" e o índice único de
    // sincronização única impediria a próxima execução.
    if (!concluido) await repo.marcarJobParcial(job.id, "Smoke encerrado sem concluir");

    expect(concluido, "job concluído dentro do limite de ticks").toBe(true);
    expect(recebidos, "registros recebidos da fonte").toBeGreaterThan(0);

    // O que a fonte anunciou tem de aparecer no catálogo. Pode haver diferença
    // para menos por duplicidade entre páginas, nunca um catálogo vazio.
    const progresso = await repo.progressoSegmentos(job.id);
    expect(progresso.concluidos).toBe(1);
    expect(progresso.pendentes).toBe(0);

    const consulta = await repo.buscarLicitacoes({
      filtros: { uf: "DF" },
      ordenarPor: "data_encerramento_proposta",
      direcao: "asc",
      limite: 5,
      deslocamento: 0,
      scoreMinimo: cfg.score_minimo_recomendado,
    });

    console.log(
      `\nCatálogo: ${consulta.total} licitações do DF gravadas ` +
        `(fonte informou ${totalFonte}; ${novos} novas nesta coleta)\n`,
    );
    expect(consulta.total).toBeGreaterThan(0);

    // Amostra do que foi gravado, para conferência visual do mapeamento.
    for (const item of consulta.itens.slice(0, 3)) {
      console.log(
        `  ${item["numero_controle_pncp"]} | ${item["uf"]} | ` +
          `encerra ${item["data_encerramento_proposta"]} | ` +
          `valor ${item["valor_total_estimado"] ?? "não informado"} | ` +
          `score ${item["score_aderencia"]} | ${String(item["objeto"]).slice(0, 60)}…`,
      );
    }

    const primeiroItem = consulta.itens[0]!;
    expect(primeiroItem["numero_controle_pncp"], "identidade canônica gravada").toBeTruthy();
    expect(primeiroItem["uf"], "filtro nativo de UF respeitado").toBe("DF");
  }, 900_000);
});
