import { describe, it, expect } from "vitest";
import { coloredSourceCovers, upsertColoredSourceCover, type SourceCover } from "./source-covers";

const sc = (o: Partial<SourceCover> & { id: string }): SourceCover => ({
  url: `/sc/${o.id}.png`, titleSafe: "top", sourceInteriorId: "p1", createdAt: "2026-08-14", ...o,
});

describe("coloredSourceCovers", () => {
  it("keeps only covers that have a coloredUrl", () => {
    const list = [sc({ id: "a" }), sc({ id: "b", coloredUrl: "/c/b.png" })];
    expect(coloredSourceCovers(list).map((c) => c.id)).toEqual(["b"]);
  });
});

describe("upsertColoredSourceCover", () => {
  it("sets coloredUrl + style without mutating url or the input array", () => {
    const list = [sc({ id: "a" })];
    const next = upsertColoredSourceCover(list, "a", "/c/a.png", "style1", "v1");
    expect(next[0].coloredUrl).toBe("/c/a.png");
    expect(next[0].coloringStyleId).toBe("style1");
    expect(next[0].coloringVariantId).toBe("v1");
    expect(next[0].url).toBe("/sc/a.png");      // B&W preserved
    expect(list[0].coloredUrl).toBeUndefined(); // input not mutated
  });

  it("returns an unchanged clone when scId is absent", () => {
    const list = [sc({ id: "a" })];
    expect(upsertColoredSourceCover(list, "missing", "/c/x.png")).toEqual(list);
  });

  it("propagates an explicit null variantId (clears the variant)", () => {
    const list = [sc({ id: "a", coloringVariantId: "v1" })];
    const next = upsertColoredSourceCover(list, "a", "/c/a.png", "style1", null);
    expect(next[0].coloringVariantId).toBeNull();
  });
});
