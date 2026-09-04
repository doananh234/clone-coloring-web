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

  // --- every position stays pure black-and-white line art (B&W guard) ---

  it("every position forbids color — stays pure black-and-white line art", () => {
    for (const pos of ["top", "middle", "bottom"] as const) {
      const p = buildCoverSourceBWPrompt(pos).toLowerCase();
      expect(p).toMatch(/black-and-white|black and white|black line art/);
      expect(p).toMatch(/line art|line-art/);
      expect(p).toMatch(/no color|do not colou?r|no colour/);
      expect(p).toMatch(/no (grayscale|gray|shading|fills?)/);
    }
  });

  // --- middle & bottom: dedicated per-position title areas ---

  it("middle & bottom preserve the source composition and their own title region", () => {
    const middle = buildCoverSourceBWPrompt("middle").toLowerCase();
    expect(middle).toMatch(/middle title area/);
    expect(middle).toMatch(/preserve the original/);

    const bottom = buildCoverSourceBWPrompt("bottom").toLowerCase();
    expect(bottom).toMatch(/bottom typography staging region|lower title area/);
    expect(bottom).toMatch(/preserve the original/);
  });

  // --- clear title band override: middle & bottom append a shared override that
  //     reserves real, decoration-free title space without removing the source.
  //     TOP is self-contained (governs its own top typography region) and does
  //     NOT get the override — see the dedicated top assertions below. ---
  it("appends a clear title-band override to middle & bottom", () => {
    for (const pos of ["middle", "bottom"] as const) {
      const p = buildCoverSourceBWPrompt(pos).toLowerCase();
      expect(p).toMatch(/title clearspace|clear, usable title band/);
      expect(p).toMatch(/keep decoration out of this band/);
      // must not sacrifice the source characters to make the band
      expect(p).toMatch(/do not move, shrink, rearrange, or remove/);
    }
  });

  it("top is self-contained and does NOT append the shared title-band override", () => {
    const p = buildCoverSourceBWPrompt("top");
    // The override block is not appended; the top prompt ends on its own.
    expect(p).not.toMatch(/TITLE CLEARSPACE — OVERRIDING RULE/);
    expect(p.trimEnd()).toMatch(/TOP COVER\.$/);
  });

  // --- top: dedicated square-cover prompt (top-center title header) ---

  it("top uses the 1:1 square cover prompt with an upper title/subtitle staging area", () => {
    const p = buildCoverSourceBWPrompt("top");
    const lower = p.toLowerCase();
    expect(p).toMatch(/1:1 square/i);
    expect(lower).toMatch(/top center|upper 2\d/);
    expect(lower).toMatch(/subtitle/);
    expect(lower).toMatch(/black-and-white|black line art/);
    expect(lower).toMatch(/no border|borderless/);
    // stays B&W and text-free like the other positions
    expect(lower).toMatch(/no color/);
    expect(lower).toMatch(/no text|do not generate .*text/);
  });
});
