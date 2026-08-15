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

  // --- middle & bottom: shared 25%/75% recompose template ---

  it("middle & bottom reserve a 25% title-safe area and 75% illustration", () => {
    for (const pos of ["middle", "bottom"] as const) {
      const p = buildCoverSourceBWPrompt(pos);
      expect(p).toMatch(/25%/);
      expect(p).toMatch(/75%/);
      expect(p.toLowerCase()).toMatch(/title-safe/);
    }
  });

  it("middle & bottom put the title-safe area at the requested edge", () => {
    expect(buildCoverSourceBWPrompt("bottom").toLowerCase()).toMatch(/lower 25%/);
    expect(buildCoverSourceBWPrompt("middle").toLowerCase()).toMatch(/middle ~?25%|middle band/);
  });

  it("middle forbids color — stays pure black-and-white line art", () => {
    const p = buildCoverSourceBWPrompt("middle").toLowerCase();
    expect(p).toMatch(/black-and-white|black and white/);
    expect(p).toMatch(/line art|line-art/);
    expect(p).toMatch(/no color|do not colou?r|no colour/);
    expect(p).toMatch(/no (grayscale|gray|shading|fills?)/);
  });

  // --- top: dedicated premium square-cover prompt (tuned separately) ---

  it("top uses the 1:1 square premium cover prompt with a protected top title zone", () => {
    const p = buildCoverSourceBWPrompt("top");
    const lower = p.toLowerCase();
    expect(p).toMatch(/1:1 square/i);
    expect(lower).toMatch(/top \d+%|top center/);
    expect(lower).toMatch(/subtitle/);
    expect(lower).toMatch(/black-and-white|black line art|black line-art/);
    expect(lower).toMatch(/no border|borderless/);
    // stays B&W and text-free like the other positions
    expect(lower).toMatch(/no color/);
    expect(lower).toMatch(/no text|do not generate .*text/);
  });
});
