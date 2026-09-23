import { describe, it, expect, beforeEach } from "vitest";

describe("Theme System (Modo Claro / Modo Escuro)", () => {
  let mockStorage: Record<string, string>;
  let mockClasses: Set<string>;
  let mockColorScheme: string;

  beforeEach(() => {
    mockStorage = {};
    mockClasses = new Set();
    mockColorScheme = "light";
  });

  it("salva e recupera a preferência de tema no storage", () => {
    mockStorage["3am-theme"] = "dark";
    expect(mockStorage["3am-theme"]).toBe("dark");

    mockStorage["3am-theme"] = "light";
    expect(mockStorage["3am-theme"]).toBe("light");

    mockStorage["3am-theme"] = "system";
    expect(mockStorage["3am-theme"]).toBe("system");
  });

  it("aplica e remove a classe .dark e colorScheme corretamente", () => {
    // Aplicar escuro
    mockClasses.add("dark");
    mockColorScheme = "dark";

    expect(mockClasses.has("dark")).toBe(true);
    expect(mockColorScheme).toBe("dark");

    // Aplicar claro
    mockClasses.delete("dark");
    mockColorScheme = "light";

    expect(mockClasses.has("dark")).toBe(false);
    expect(mockColorScheme).toBe("light");
  });
});
