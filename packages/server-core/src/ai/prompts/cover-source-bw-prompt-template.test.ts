import { describe, it, expect } from "vitest";
import { buildCoverSourceBWPrompt } from "./cover-source-bw-prompt-template";

describe("buildCoverSourceBWPrompt", () => {
  it("returns a non-trivial string for each position", () => {
    for (const pos of ["top", "middle", "bottom"] as const) {
      expect(buildCoverSourceBWPrompt(pos).length).toBeGreaterThan(200);
    }
  });

  it("every position forbids text and preserves the original artwork", () => {
    for (const pos of ["top", "middle", "bottom"] as const) {
      const p = buildCoverSourceBWPrompt(pos).toLowerCase();
      expect(p).toMatch(/no text|do not draw any text|do not generate .*text|any text/);
      expect(p).toMatch(/preserve|keep the original/);
    }
  });

  // --- all three positions share the 25%/75% recompose template ---

  it("every position reserves a 25% title-safe area and 75% illustration", () => {
    for (const pos of ["top", "middle", "bottom"] as const) {
      const p = buildCoverSourceBWPrompt(pos);
      expect(p).toMatch(/25%/);
      expect(p).toMatch(/75%/);
      expect(p.toLowerCase()).toMatch(/title-safe/);
    }
  });

  it("each position puts the title-safe area at the requested edge", () => {
    expect(buildCoverSourceBWPrompt("top").toLowerCase()).toMatch(/upper 25%/);
    expect(buildCoverSourceBWPrompt("bottom").toLowerCase()).toMatch(/lower 25%/);
    expect(buildCoverSourceBWPrompt("middle").toLowerCase()).toMatch(/middle ~?25%|middle band/);
  });

  it("every position forbids color — stays pure black-and-white line art", () => {
    for (const pos of ["top", "middle", "bottom"] as const) {
      const p = buildCoverSourceBWPrompt(pos).toLowerCase();
      expect(p).toMatch(/black-and-white|black and white/);
      expect(p).toMatch(/line art|line-art/);
      expect(p).toMatch(/no color|do not colou?r|no colour/);
      expect(p).toMatch(/no (grayscale|gray|shading|fills?)/);
    }
  });
});
