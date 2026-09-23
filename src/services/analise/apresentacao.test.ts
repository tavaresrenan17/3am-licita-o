import { describe, expect, it } from "vitest";
import { formatarApresentacaoAnalise } from "./apresentacao";
import type { AnaliseLicitacaoDTO } from "../../lib/dto";
import { parsearAnaliseResultado } from "./contrato";
import { respostaV2 } from "./__fixtures__/respostaV2";

describe("formatarApresentacaoAnalise", () => {
  it("trata nulo como nunca gerada", () => {
    const a = formatarApresentacaoAnalise(null);
    expect(a.estadoVisual).toBe("nunca");
    expect(a.rotuloBotaoAcao).toMatch(/gerar an[aá]lise/i);
    expect(a.permiteRegenerar).toBe(false);
    expect(a.carregando).toBe(false);
  });

  it("trata estado processando", () => {
    const dto: AnaliseLicitacaoDTO = {
      licitacaoId: "lic-1",
      estado: "processando",
      resultado: null,
      fontes: [],
      cobertura: { estado: "completa", ativos: 1, disponiveis: 1, falhos: 0, pendentes: 0 },
      modelo: "gpt-4o-mini",
      erro: null,
      geradoEm: null,
      atualizadoEm: new Date().toISOString(),
    };
    const a = formatarApresentacaoAnalise(dto);
    expect(a.estadoVisual).toBe("processando");
    expect(a.carregando).toBe(true);
    expect(a.permiteRegenerar).toBe(false);
  });

  it("trata estado erro", () => {
    const dto: AnaliseLicitacaoDTO = {
      licitacaoId: "lic-1",
      estado: "erro",
      resultado: null,
      fontes: [],
      cobertura: { estado: "parcial", ativos: 1, disponiveis: 0, falhos: 1, pendentes: 0 },
      modelo: null,
      erro: "Falha na conexão",
      geradoEm: null,
      atualizadoEm: new Date().toISOString(),
    };
    const a = formatarApresentacaoAnalise(dto);
    expect(a.estadoVisual).toBe("erro");
    expect(a.rotuloBotaoAcao).toMatch(/tentar novamente|gerar/i);
    expect(a.permiteRegenerar).toBe(true);
  });

  it("trata cobertura indisponivel", () => {
    const dto: AnaliseLicitacaoDTO = {
      licitacaoId: "lic-1",
      estado: "erro",
      resultado: null,
      fontes: [],
      cobertura: { estado: "indisponivel", ativos: 0, disponiveis: 0, falhos: 0, pendentes: 0 },
      modelo: null,
      erro: "Sem texto",
      geradoEm: null,
      atualizadoEm: new Date().toISOString(),
    };
    const a = formatarApresentacaoAnalise(dto);
    expect(a.estadoVisual).toBe("indisponivel");
  });

  it("oferece refazer quando a análise salva está no formato anterior às três partes", () => {
    const dto: AnaliseLicitacaoDTO = {
      licitacaoId: "lic-1",
      estado: "pronta",
      resultado: {
        veredito: "favoravel",
        confianca: "alta",
        resumoExecutivo: "Muito bom",
        pontosImportantes: [],
        prazos: [],
        requisitos: [],
        riscos: [],
        proximosPassos: [],
      },
      fontes: [],
      cobertura: { estado: "completa", ativos: 1, disponiveis: 1, falhos: 0, pendentes: 0 },
      modelo: "gpt-4o-mini",
      erro: null,
      geradoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    };
    const a = formatarApresentacaoAnalise(dto);
    expect(a.estadoVisual).toBe("desatualizada");
    expect(a.permiteRegenerar).toBe(true);
    expect(a.rotuloBotaoAcao).toMatch(/refazer/i);
    expect(a.vereditoFormatado?.texto).toMatch(/favor[aá]vel/i);
  });

  it("trata estado pronta com veredito", () => {
    const dto: AnaliseLicitacaoDTO = {
      licitacaoId: "lic-1",
      estado: "pronta",
      resultado: parsearAnaliseResultado(
        JSON.stringify({ ...respostaV2("fonte-1"), veredito: "favoravel" }),
      ),
      fontes: [],
      cobertura: { estado: "completa", ativos: 1, disponiveis: 1, falhos: 0, pendentes: 0 },
      modelo: "gpt-4o-mini",
      erro: null,
      geradoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    };
    const a = formatarApresentacaoAnalise(dto);
    expect(a.estadoVisual).toBe("pronta");
    expect(a.permiteRegenerar).toBe(false);
    expect(a.rotuloBotaoAcao).toMatch(/salva/i);
    expect(a.vereditoFormatado?.texto).toMatch(/favor[aá]vel/i);
  });
});
