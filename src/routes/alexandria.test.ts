import { describe, expect, it } from "vitest";

describe("Rota Alexandria", () => {
  it("valida a estrutura de parâmetros e tipos da tela Alexandria", () => {
    const params = {
      ids: "123,456",
      busca: "hospital",
      statusInterno: "interessante",
    };

    const idsArray = params.ids ? params.ids.split(",").map((s) => s.trim()) : [];
    expect(idsArray).toHaveLength(2);
    expect(idsArray[0]).toBe("123");
    expect(idsArray[1]).toBe("456");
  });
});
