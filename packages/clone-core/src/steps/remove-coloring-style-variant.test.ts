import { describe, it, expect } from "vitest";
import { removeVariant } from "./remove-coloring-style-variant";

const mk = (id: string, color: string) => ({
  id,
  colorPalette: { primaryColors: [color] },
  thumbnailUrl: `/thumb/${id}.png`,
  colorizationDirective: `dir ${id}`,
  sourceBookId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("removeVariant", () => {
  it("removes a middle variant without re-mirroring top-level", () => {
    const list = [mk("a", "#111"), mk("b", "#222"), mk("c", "#333")];
    const r = removeVariant(list, "b");
    expect(r.removed).toBe(true);
    expect(r.wasLast).toBe(false);
    expect(r.topLevel).toBeUndefined();
    expect(r.variants.map((v) => v.id)).toEqual(["a", "c"]);
  });

  it("re-mirrors top-level from the new first variant when index 0 is removed", () => {
    const list = [mk("a", "#111"), mk("b", "#222")];
    const r = removeVariant(list, "a");
    expect(r.removed).toBe(true);
    expect(r.variants.map((v) => v.id)).toEqual(["b"]);
    expect(r.topLevel).toEqual({
      colorPalette: { primaryColors: ["#222"] },
      thumbnailUrl: "/thumb/b.png",
      colorizationDirective: "dir b",
    });
  });

  it("blocks removing the only variant (wasLast, nothing removed)", () => {
    const list = [mk("a", "#111")];
    const r = removeVariant(list, "a");
    expect(r.removed).toBe(false);
    expect(r.wasLast).toBe(true);
    expect(r.variants.map((v) => v.id)).toEqual(["a"]);
  });

  it("no-ops for an unknown variant id", () => {
    const list = [mk("a", "#111"), mk("b", "#222")];
    const r = removeVariant(list, "zzz");
    expect(r.removed).toBe(false);
    expect(r.wasLast).toBe(false);
    expect(r.variants.map((v) => v.id)).toEqual(["a", "b"]);
  });

  it("tolerates malformed variants json", () => {
    const r = removeVariant(null, "a");
    expect(r).toEqual({ variants: [], removed: false, wasLast: false });
  });
});
