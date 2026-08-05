import { describe, it, expect } from "vitest";
import { paletteFingerprint, readVariants, buildColoringStyleVariant } from "./coloring-style-variant";

describe("paletteFingerprint", () => {
  it("is order-independent for colors", () => {
    const a = paletteFingerprint({ primaryColors: ["#AAA", "#BBB"], accentColors: ["#CCC"] });
    const b = paletteFingerprint({ primaryColors: ["#bbb", "#aaa"], accentColors: ["#ccc"] });
    expect(a).toBe(b); // case-insensitive + sorted
  });

  it("ignores the free-text description", () => {
    const base = { primaryColors: ["#111"], backgroundTone: "white" };
    expect(paletteFingerprint({ ...base, description: "one" })).toBe(
      paletteFingerprint({ ...base, description: "another" }),
    );
  });

  it("distinguishes different colors and tones", () => {
    expect(paletteFingerprint({ primaryColors: ["#111"] })).not.toBe(
      paletteFingerprint({ primaryColors: ["#222"] }),
    );
    expect(paletteFingerprint({ primaryColors: ["#111"], warmth: "warm" })).not.toBe(
      paletteFingerprint({ primaryColors: ["#111"], warmth: "cool" }),
    );
  });

  it("treats empty/undefined palettes as equal", () => {
    expect(paletteFingerprint(undefined)).toBe(paletteFingerprint({}));
  });
});

describe("readVariants", () => {
  it("returns [] for non-arrays and filters malformed items", () => {
    expect(readVariants(null)).toEqual([]);
    expect(readVariants("x")).toEqual([]);
    expect(readVariants([{ id: "a" }, { noId: true }, 5])).toHaveLength(1);
  });
});

describe("buildColoringStyleVariant", () => {
  it("strips query string from reference url and maps palette + directive", () => {
    const v = buildColoringStyleVariant(
      { colorPalette: { primaryColors: ["#111"] }, colorizationDirective: "  do it  " },
      { id: "v1", referenceUrl: "/assets/x.png?v=123", sourceBookId: "b1", now: "2026-01-01T00:00:00.000Z" },
    );
    expect(v).toEqual({
      id: "v1",
      colorPalette: { primaryColors: ["#111"] },
      thumbnailUrl: "/assets/x.png",
      colorizationDirective: "do it",
      sourceBookId: "b1",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });
});
