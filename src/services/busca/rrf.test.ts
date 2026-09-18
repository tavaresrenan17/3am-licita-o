import { describe, expect, it } from "vitest";
import { fundirRRF } from "./rrf";

describe("fundirRRF", () => {
  it("um único ranking preserva a ordem original", () => {
    const r = fundirRRF([{ peso: 1, ids: ["a", "b", "c"] }]);
    expect(r.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("calcula exatamente peso/(k+posição), com posição começando em 1", () => {
    const r = fundirRRF([{ peso: 1, ids: ["a"] }], 60);
    expect(r[0]!.score).toBeCloseTo(1 / 61, 12);
  });

  it("o peso multiplica a contribuição daquele ranking", () => {
    const r = fundirRRF(
      [
        { peso: 2, ids: ["a"] },
        { peso: 1, ids: ["b"] },
      ],
      60,
    );
    expect(r[0]!.id).toBe("a");
    expect(r[0]!.score).toBeCloseTo(2 / 61, 12);
  });

  it("id presente em dois rankings soma as duas contribuições", () => {
    const r = fundirRRF(
      [
        { peso: 1, ids: ["x", "y"] },
        { peso: 1, ids: ["x"] },
      ],
      60,
    );
    const x = r.find((i) => i.id === "x")!;
    expect(x.score).toBeCloseTo(1 / 61 + 1 / 61, 12);
  });

  it("item bem colocado nos dois rankings vence item ótimo em um só", () => {
    const r = fundirRRF([
      { peso: 1, ids: ["so_lexical", "nos_dois"] },
      { peso: 1, ids: ["nos_dois", "so_vetorial"] },
    ]);
    expect(r[0]!.id).toBe("nos_dois");
  });

  it("ranking vazio não contribui", () => {
    const r = fundirRRF([
      { peso: 1, ids: [] },
      { peso: 1, ids: ["a"] },
    ]);
    expect(r).toHaveLength(1);
  });

  it("a ordem é determinística no empate", () => {
    const a = fundirRRF([{ peso: 1, ids: ["b", "a"] }, { peso: 1, ids: ["a", "b"] }]);
    const b = fundirRRF([{ peso: 1, ids: ["b", "a"] }, { peso: 1, ids: ["a", "b"] }]);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
  });
});
