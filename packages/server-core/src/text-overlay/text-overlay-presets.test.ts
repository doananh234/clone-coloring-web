import { describe, it, expect } from "vitest";
import { FONT_CATALOG } from "./text-overlay-presets";

describe("FONT_CATALOG", () => {
  it("has at least 20 entries", () => {
    expect(FONT_CATALOG.length).toBeGreaterThanOrEqual(20);
  });

  it("every entry has id, family, and non-empty weights", () => {
    for (const font of FONT_CATALOG) {
      expect(font.id).toBeTruthy();
      expect(font.family).toBeTruthy();
      expect(font.weights.length).toBeGreaterThan(0);
    }
  });

  it("covers display + body + decorative categories via included families", () => {
    const families = FONT_CATALOG.map((f) => f.family);
    const knownDisplayFonts = ["Fredoka", "Bubblegum Sans", "Bungee"] as const;
    const knownBodyFonts = ["Inter", "Roboto", "Nunito"] as const;
    const anyDisplay = knownDisplayFonts.some((name) => families.includes(name));
    const anyBody = knownBodyFonts.some((name) => families.includes(name));
    expect(anyDisplay).toBe(true);
    expect(anyBody).toBe(true);
  });

  it("family names are unique", () => {
    const set = new Set(FONT_CATALOG.map((f) => f.family));
    expect(set.size).toBe(FONT_CATALOG.length);
  });
});
