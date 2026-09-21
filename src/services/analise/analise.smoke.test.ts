import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { criarGeradorChat } from "./gerador.server";
import { parseAnaliseResultado } from "./contrato";

if (existsSync(resolve(process.cwd(), ".env"))) {
  const envContent = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  for (const linha of envContent.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
    if (m && m[1] && m[2] !== undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

describe("Live Smoke Analise (opt-in)", () => {
  const deveRodar = !!process.env["ANALISE_API_KEY"];

  it.runIf(deveRodar)(
    "gera JSON estruturado válido com a OpenAI",
    async () => {
    const { construirPromptAnalise } = await import("./contexto");
    const gerador = criarGeradorChat();
    const prompt = construirPromptAnalise({
      metadados: { objeto: "Aquisição de notebooks educacionais", orgao: "Prefeitura Municipal" },
      blocos: [
        {
          id: "f-1",
          documentoId: "d-1",
          nome: "edital.pdf",
          indice: 0,
          texto:
            "O prazo de entrega dos computadores é de 30 dias corridos a partir da ordem de fornecimento.",
        },
      ],
      evidencias: [],
      cobertura: { estado: "completa", ativos: 1, disponiveis: 1, falhos: 0, pendentes: 0 },
    });

    const resposta = await gerador.gerar(prompt);
    const resultado = parseAnaliseResultado(resposta);

    expect(resultado).toBeDefined();
    expect(resultado.resumoExecutivo.length).toBeGreaterThan(5);
    expect(["favoravel", "atencao", "desfavoravel", "insuficiente"]).toContain(resultado.veredito);
    expect(["alta", "media", "baixa"]).toContain(resultado.confianca);
  }, 30000);
});
