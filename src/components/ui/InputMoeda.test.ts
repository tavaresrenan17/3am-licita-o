import { describe, expect, it } from "vitest";
import { InputMoeda } from "./InputMoeda";
import { formatarMoedaBRL, parseMoeda } from "@/lib/format";

describe("InputMoeda e formatação monetária", () => {
  it("InputMoeda é uma função/componente válida", () => {
    expect(typeof InputMoeda).toBe("object"); // React.forwardRef retorna objeto
    expect(InputMoeda.$$typeof).toBeDefined();
  });

  it("formata valores monetários com máscara brasileira de acordo com a regra global", () => {
    expect(formatarMoedaBRL(0)).toBe("R$ 0,00");
    expect(formatarMoedaBRL(100)).toBe("R$ 100,00");
    expect(formatarMoedaBRL(1000)).toBe("R$ 1.000,00");
    expect(formatarMoedaBRL(1000000)).toBe("R$ 1.000.000,00");
    expect(formatarMoedaBRL(123456789.99)).toBe("R$ 123.456.789,99");
    expect(formatarMoedaBRL("50000")).toBe("R$ 50.000,00");
  });

  it("converte valores limpos preservando o tipo numérico esperado pelo backend", () => {
    expect(parseMoeda("R$ 50.000,00")).toBe(50000);
    expect(parseMoeda("R$ 1.000.000,00")).toBe(1000000);
    expect(parseMoeda("R$ 123,45")).toBe(123.45);
  });
});
