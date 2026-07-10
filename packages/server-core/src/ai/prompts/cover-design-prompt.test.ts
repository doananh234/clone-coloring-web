import { describe, it, expect } from "vitest";
import {
  buildCoverDesignPrompt,
  type CoverDesignContext,
  type CoverDesignPack,
} from "./cover-design-prompt";

const CTX: CoverDesignContext = {
  title: "Dinosaur Adventures",
  subtitle: "For kids age 4-8",
  brandName: "Kids Coloring Club",
  category: "coloring-books",
  ageRange: "4-8",
};

const FONTS = ["Fredoka", "Comfortaa", "Inter", "Pacifico", "Poppins"];

describe("buildCoverDesignPrompt", () => {
  it("returns systemPrompt + userPrompt strings", () => {
    const { systemPrompt, userPrompt } = buildCoverDesignPrompt(CTX, FONTS);
    expect(typeof systemPrompt).toBe("string");
    expect(typeof userPrompt).toBe("string");
    expect(systemPrompt.length).toBeGreaterThan(50);
    expect(userPrompt.length).toBeGreaterThan(50);
  });

  it("systemPrompt instructs JSON-only output", () => {
    const { systemPrompt } = buildCoverDesignPrompt(CTX, FONTS);
    expect(systemPrompt.toLowerCase()).toMatch(/return only valid json|json.*schema/i);
  });

  it("userPrompt embeds book context", () => {
    const { userPrompt } = buildCoverDesignPrompt(CTX, FONTS);
    expect(userPrompt).toContain("Dinosaur Adventures");
    expect(userPrompt).toContain("Kids Coloring Club");
    expect(userPrompt).toContain("4-8");
  });

  it("userPrompt lists allowed font names for the LLM to pick from", () => {
    const { userPrompt } = buildCoverDesignPrompt(CTX, FONTS);
    expect(userPrompt).toContain("Fredoka");
    expect(userPrompt).toContain("Inter");
  });

  it("CoverDesignPack type is structurally correct", () => {
    const pack: CoverDesignPack = {
      titles: ["A", "B"],
      subtitles: ["s"],
      brandLines: ["b"],
      fontPairs: [{ id: "p1", display: "Fredoka", body: "Inter" }],
      palettes: [
        { id: "pal1", name: "warm", background: "#fff", primary: "#000", secondary: "#111", accent: "#222" },
      ],
      layoutHint: "centered",
    };
    expect(pack.layoutHint).toBe("centered");
    expect(pack.fontPairs[0].display).toBe("Fredoka");
  });
});
