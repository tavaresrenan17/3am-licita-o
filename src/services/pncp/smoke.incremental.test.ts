/**
 * SMOKE REAL: ciclo incremental por atualização global, com o código de produção.
 *
 * Não roda na suíte normal: exige SMOKE_INCREMENTAL=1.
 *
 *   $env:SMOKE_INCREMENTAL=1; npx vitest run src/services/pncp/smoke.incremental.test.ts
 *
 * Recorte estreito de propósito. Medição de 15/09/2026: a mesma janela de 4
 * dias, nacional, em apenas 7 das 19 modalidades já devolvia 15.261 registros
 * em 308 páginas. O incremental traz tudo que MUDOU, inclusive contratações
 * encerradas há anos — validar o mecanismo não exige (nem justifica) despejar
 * isso no catálogo.
 *
 * Exige a migração 20260915140000_sincronizacao_incremental.sql aplicada.
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

const ativo = process.env["SMOKE_INCREMENTAL"] === "1";

describe.skipIf(!ativo)("smoke real — ciclo incremental", () => {
  it("planeja janelas, coleta as mudanças e avança a fronteira de cobertura", async () => {
    carregarEnv();
    expect(process.env["SUPABASE_SERVICE_ROLE_KEY"], "chave de serviço no .env").toBeTruthy();

    const repo = await import("./repositorio.server");
    const { executarTick } = await import("./worker.server");
    const { planejarIncremental, descreverIncremental, dataCalendario, somarDias } =
      await import("./planner");

    // DF com as duas modalidades que importam para obra: Concorrência
    // Eletrônica (4) e Pregão Eletrônico (6).
    const UFS = ["DF"];
    const MODALIDADES = [4, 6];

    const inicioPadrao = await repo.inicioPadraoIncremental();
    expect(inicioPadrao, "carga inicial registrada").toBeTruthy();

    const antes = (await repo.diagnosticoCobertura()) as Record<string, unknown>;
    console.log(`\nCobertura antes: ${JSON.stringify(antes)}`);

    const anterior = await repo.jobEmAndamento();
    if (anterior) await repo.marcarJobParcial(anterior.id, "Substituída pelo smoke incremental");

    const agora = new Date();
    const hoje = dataCalendario(agora);
    const coberturas = await repo.listarCoberturaIncremental();

    const escopo = {
      ufs: UFS,
      modalidades: MODALIDADES,
      inicioPadrao: inicioPadrao!,
      sobreposicaoDias: 2,
      janelaDias: 7,
    };

    const segmentos = planejarIncremental(escopo, coberturas, agora);
    console.log(
      `Plano: ${segmentos.length} janela(s) — ${descreverIncremental(escopo, segmentos.length)}`,
    );
    for (const s of segmentos) console.log(`  ${s.descricao}`);
    expect(segmentos.length).toBeGreaterThan(0);

    const cfg = await repo.obterConfiguracoes();
    const job = await repo.criarSincronizacao(
      escopo,
      descreverIncremental(escopo, segmentos.length),
      segmentos,
      { tipo: "incremental", cutoff: agora.toISOString() },
    );

    let voltas = 0;
    let recebidos = 0;
    let novos = 0;
    let atualizados = 0;
    let concluido = false;

    while (voltas++ < 30 && !concluido) {
      const resumo = await executarTick(job.id, {
        banco: repo.portaIngestao(),
        cfg: {
          palavras_chave: cfg.palavras_chave,
          score_peso_palavras: cfg.score_peso_palavras,
          score_peso_documentos: cfg.score_peso_documentos,
          score_peso_valor: cfg.score_peso_valor,
        },
        orcamentoMs: 120_000,
      });

      recebidos += resumo.recebidos;
      novos += resumo.novos;
      atualizados += resumo.atualizados;
      concluido = resumo.jobConcluido;

      console.log(
        `tick ${voltas}: páginas=${resumo.paginasAplicadas} recebidos=${resumo.recebidos} ` +
          `novos=${resumo.novos} atualizados=${resumo.atualizados} erros=${resumo.erros.length}`,
      );
      if (resumo.erros.length > 0) console.log("  erros:", resumo.erros.slice(0, 3));
      if (resumo.paginasAplicadas === 0 && resumo.erros.length > 0) break;
    }

    if (!concluido) await repo.marcarJobParcial(job.id, "Smoke incremental encerrado sem concluir");
    expect(concluido, "ciclo concluído dentro do limite de ticks").toBe(true);

    const progresso = await repo.progressoSegmentos(job.id);
    expect(progresso.pendentes).toBe(0);
    console.log(
      `\nSegmentos: ${progresso.concluidos}/${progresso.planejados} concluídos, ` +
        `${progresso.falhados} com falha · ${recebidos} recebidos, ${novos} novos, ${atualizados} atualizados`,
    );

    // O avanço da fronteira é o que distingue o incremental de uma recarga.
    const particoes = await repo.avancarCobertura(job.id, agora);
    expect(particoes, "partições com fronteira gravada").toBe(UFS.length * MODALIDADES.length);

    const cobertura = await repo.listarCoberturaIncremental();
    const nossas = cobertura.filter((c) => c.uf === "DF" && MODALIDADES.includes(c.modalidadeId));
    console.log(`\nCobertura depois: ${JSON.stringify(nossas)}`);

    expect(nossas).toHaveLength(MODALIDADES.length);
    for (const c of nossas) {
      // A janela alcança hoje, e o dia corrente nunca fecha: a fronteira
      // precisa parar em ontem, nem antes nem depois.
      expect(c.ultimaDataFechada, `fronteira da modalidade ${c.modalidadeId}`).toBe(
        somarDias(hoje, -1),
      );
    }

    const diag = (await repo.diagnosticoCobertura()) as Record<string, unknown>;
    console.log(`Diagnóstico: ${JSON.stringify(diag)}`);

    // Rodar de novo agora não deve replanejar o passado inteiro: a fronteira
    // já avançou, então só sobra a janela da sobreposição até hoje.
    const replanejado = planejarIncremental(escopo, await repo.listarCoberturaIncremental(), agora);
    console.log(
      `\nPróximo ciclo planejaria ${replanejado.length} janela(s) (era ${segmentos.length}).`,
    );
    expect(replanejado.length).toBeLessThanOrEqual(segmentos.length);
  }, 900_000);
});
