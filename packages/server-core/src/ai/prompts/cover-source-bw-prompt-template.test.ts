import { describe, it, expect } from "vitest";
import { buildCoverSourceBWPrompt } from "./cover-source-bw-prompt-template";

describe("buildCoverSourceBWPrompt", () => {
  it("returns a non-trivial string for each position", () => {
    for (const pos of ["top", "middle", "bottom"] as const) {
      expect(buildCoverSourceBWPrompt(pos).length).toBeGreaterThan(200);
    }
  });

  it("forbids color — stays pure black-and-white line art", () => {
    const p = buildCoverSourceBWPrompt("top").toLowerCase();
    expect(p).toMatch(/black-and-white|black and white/);
    expect(p).toMatch(/line art|line-art/);
    expect(p).toMatch(/no color|do not colou?r|no colour/);
    expect(p).toMatch(/no (grayscale|gray|shading|fills?)/);
  });

  it("reserves a 25% title-safe area and 75% illustration", () => {
    const top = buildCoverSourceBWPrompt("top");
    expect(top).toMatch(/25%/);
    expect(top).toMatch(/75%/);
    expect(top.toLowerCase()).toMatch(/title-safe/);
  });

  it("puts the title-safe area at the requested edge", () => {
    expect(buildCoverSourceBWPrompt("top").toLowerCase()).toMatch(/upper 25%/);
    expect(buildCoverSourceBWPrompt("bottom").toLowerCase()).toMatch(/lower 25%/);
    expect(buildCoverSourceBWPrompt("middle").toLowerCase()).toMatch(/middle ~?25%|middle band/);
  });

  it("forbids any text and requires preserving the original line-art", () => {
    const p = buildCoverSourceBWPrompt("bottom").toLowerCase();
    expect(p).toMatch(/no text|do not draw any text|any text:/);
    expect(p).toMatch(/preserve|keep the original/);
  });
});
