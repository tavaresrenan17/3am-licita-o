import { describe, expect, it } from "vitest";
import { BarraAcoesLote } from "./BarraAcoesLote";
import { StatusDocumentosBadge } from "./StatusDocumentosBadge";

describe("BarraAcoesLote e StatusDocumentosBadge", () => {
  it("BarraAcoesLote é uma função de componente válida", () => {
    expect(typeof BarraAcoesLote).toBe("function");
  });

  it("StatusDocumentosBadge é uma função de componente válida", () => {
    expect(typeof StatusDocumentosBadge).toBe("function");
  });
});
