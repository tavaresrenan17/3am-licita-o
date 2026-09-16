/**
 * SMOKE REAL: documentos do PNCP → Supabase, com o código de produção.
 *
 * Não roda na suíte normal: exige SMOKE_DOCS=1. Coleta um punhado de
 * licitações — nunca teste de carga contra o PNCP (arquivo 05 §7).
 *
 *   $env:SMOKE_DOCS=1; npx vitest run src/services/pncp/smoke.documentos.test.ts
 *
 * Exige a migração 20260915090000_coleta_documentos.sql aplicada.
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

const ativo = process.env["SMOKE_DOCS"] === "1";

describe.skipIf(!ativo)("smoke real — coleta de documentos", () => {
  it("reserva, consulta a base de Integração e grava o catálogo de documentos", async () => {
    carregarEnv();
    expect(process.env["SUPABASE_SERVICE_ROLE_KEY"], "chave de serviço no .env").toBeTruthy();

    const repo = await import("./repositorio.server");
    const { executarTickDocumentos } = await import("./worker.documentos.server");

    const antes = (await repo.coberturaDocumentos()) as Record<string, number>;
    console.log(
      `\nAntes: ${antes["completas"]} de ${antes["elegiveis"]} licitações coletadas, ` +
        `${antes["documentos_total"]} documentos no catálogo`,
    );

    const cfg = await repo.obterConfiguracoes();

    // Recorte pequeno de propósito: prova o fluxo sem pressionar a fonte.
    const resumo = await executarTickDocumentos({
      banco: repo.portaDocumentos(),
      cfg: {
        palavras_chave: cfg.palavras_chave,
        score_peso_palavras: cfg.score_peso_palavras,
        score_peso_documentos: cfg.score_peso_documentos,
        score_peso_valor: cfg.score_peso_valor,
      },
      maxLicitacoesPorTick: 10,
      loteReserva: 10,
      orcamentoMs: 120_000,
    });

    console.log(
      `tick: licitações=${resumo.licitacoesProcessadas} documentos=${resumo.documentosGravados} ` +
        `sem anexo=${resumo.semDocumentos} erros=${resumo.erros.length} ` +
        `em ${Math.round(resumo.duracaoMs / 1000)}s`,
    );
    if (resumo.erros.length > 0) console.log("  erros:", resumo.erros.slice(0, 5));

    expect(resumo.licitacoesProcessadas, "licitações coletadas").toBeGreaterThan(0);

    const depois = (await repo.coberturaDocumentos()) as Record<string, number>;
    console.log(
      `Depois: ${depois["completas"]} de ${depois["elegiveis"]} coletadas, ` +
        `${depois["documentos_total"]} documentos ` +
        `(${depois["com_edital"]} com edital, ${depois["com_projeto"]} com projeto, ` +
        `${depois["com_orcamento"]} com orçamento)\n`,
    );

    expect(depois["completas"]!).toBeGreaterThan(antes["completas"]!);

    // Amostra do que foi gravado, para conferência visual da classificação.
    const comDocs = await repo.buscarLicitacoes({
      filtros: { com_edital: true },
      ordenarPor: "data_encerramento_proposta",
      direcao: "asc",
      limite: 3,
      deslocamento: 0,
      scoreMinimo: cfg.score_minimo_recomendado,
    });

    console.log(`Licitações com edital no catálogo: ${comDocs.total}`);
    for (const item of comDocs.itens) {
      const detalhe = await repo.obterLicitacao(String(item["id"]));
      console.log(
        `  ${item["numero_controle_pncp"]} · score ${item["score_aderencia"]} · ` +
          `${detalhe?.documentos.length ?? 0} documentos`,
      );
      for (const d of (detalhe?.documentos ?? []).slice(0, 4)) {
        console.log(
          `      [${d["tipo_documento"]}] ${String(d["nome"]).slice(0, 60)} ` +
            `(PNCP: ${d["tipo_documento_pncp"] ?? "não declarado"})`,
        );
      }
    }

    // O filtro "com edital" só faz sentido depois da coleta: antes dela ele
    // encontrava zero por ausência de dado, não por ausência de edital.
    expect(comDocs.total).toBeGreaterThan(0);
  }, 600_000);
});
