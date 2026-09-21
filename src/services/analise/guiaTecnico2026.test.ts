import { describe, expect, it } from "vitest";
import {
  BENEFICIOS_ME_EPP_LEI_COMPLEMENTAR_123,
  DIRETRIZES_ENGENHARIA_E_OBRAS,
  EXIGENCIAS_INDEVIDAS_E_ILEGAIS,
  obterMemoriaGuiaTecnico2026,
  PRAZOS_MINIMOS_PROPOSTA_DIAS_UTEIS,
  RITUAIS_INUTEIS_E_DISPENSAVEIS,
  VALORES_REFERENCIA_2026,
  VINTE_PONTOS_ATENCAO_CRITICOS,
} from "./guiaTecnico2026";
import { construirPromptAnalise } from "./contexto";
import { CONSULTAS_TEMATICAS } from "./contrato";

describe("Guia Técnico de Referência 2026 - Memória da IA", () => {
  it("contém os limites financeiros atualizados do Decreto 12.807/2025 vigentes em 2026", () => {
    expect(VALORES_REFERENCIA_2026.dispensaObrasServicosEngenharia).toBe(130_984.2);
    expect(VALORES_REFERENCIA_2026.dispensaComprasDemaisServicos).toBe(65_492.11);
    expect(VALORES_REFERENCIA_2026.grandeVulto).toBe(261_968_421.04);
  });

  it("consolida os 20 pontos de atenção que decidem o resultado", () => {
    expect(VINTE_PONTOS_ATENCAO_CRITICOS).toHaveLength(20);
    const titulos = VINTE_PONTOS_ATENCAO_CRITICOS.map((p) => p.titulo);
    expect(titulos[0]).toMatch(/Certidão Vencida/i);
    expect(titulos[6]).toMatch(/75%/); // Inexequibilidade 75%
    expect(titulos[7]).toMatch(/85%/); // Garantia adicional 85%
  });

  it("mapeia as exigências indevidas e ilegais para fundamentar impugnação", () => {
    expect(EXIGENCIAS_INDEVIDAS_E_ILEGAIS.length).toBeGreaterThan(5);
    const motivos = EXIGENCIAS_INDEVIDAS_E_ILEGAIS.map((e) => e.motivo).join(" ");
    const fundamentos = EXIGENCIAS_INDEVIDAS_E_ILEGAIS.map((e) => e.fundamento).join(" ");
    expect(motivos).toContain("taxativo");
    expect(fundamentos).toContain("Súmula TCU nº 263");
    expect(fundamentos).toContain("Art. 63, IV");
  });

  it("mapeia rituais obsoletos dispensados por lei para a seção 'itensNaoImportantes'", () => {
    expect(RITUAIS_INUTEIS_E_DISPENSAVEIS.length).toBeGreaterThan(3);
    const rituais = RITUAIS_INUTEIS_E_DISPENSAVEIS.map((r) => r.ritual).join(" ");
    expect(rituais).toContain("cartório");
    expect(rituais).toContain("declarações avulsas");
  });

  it("contém regras específicas de obras, engenharia e regimes de execução", () => {
    expect(DIRETRIZES_ENGENHARIA_E_OBRAS.linha75e85).toContain("75%");
    expect(DIRETRIZES_ENGENHARIA_E_OBRAS.linha75e85).toContain("85%");
    expect(DIRETRIZES_ENGENHARIA_E_OBRAS.referenciasOficiais).toContain("SINAPI");
  });

  it("injeta a memória completa no prompt seguro de análise", () => {
    const prompt = construirPromptAnalise({
      metadados: { objeto: "Construção de escola municipal" },
      blocos: [
        {
          id: "b-1",
          documentoId: "doc-1",
          nome: "edital.pdf",
          indice: 0,
          texto: "Exige-se visita técnica obrigatória e balanço patrimonial com faturamento prévio.",
        },
      ],
      evidencias: [],
      cobertura: { estado: "completa", ativos: 1, disponiveis: 1, falhos: 0, pendentes: 0 },
    });

    expect(prompt).toContain("MEMÓRIA TÉCNICA ESPECIALIZADA: LEI Nº 14.133/2021 - EDIÇÃO 2026");
    expect(prompt).toContain("Decreto nº 12.807/2025");
    expect(prompt).toContain("130.984,20");
    expect(prompt).toContain("Linha dos 75%");
    expect(prompt).toContain("Linha dos 85%");
    expect(prompt).toContain("Lei nº 13.726/2018");
  });

  it("mantém os 10 IDs canônicos em CONSULTAS_TEMATICAS com queries enriquecidas", () => {
    expect(CONSULTAS_TEMATICAS).toHaveLength(10);
    const temaHabilitacao = CONSULTAS_TEMATICAS.find((t) => t.id === "habilitacao");
    expect(temaHabilitacao?.consulta).toContain("CRF FGTS 30 dias");
    const temaJulgamento = CONSULTAS_TEMATICAS.find((t) => t.id === "julgamento_proposta");
    expect(temaJulgamento?.consulta).toContain("inexequibilidade 75%");
  });
});
