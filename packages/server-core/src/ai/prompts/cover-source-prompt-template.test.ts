import { describe, it, expect } from "vitest";
import { buildCoverSourcePrompt } from "./cover-source-prompt-template";

const DIRECTIVE = "soft pastel watercolor palette, cozy warm lighting";

describe("buildCoverSourcePrompt", () => {
  it("returns a non-trivial prompt string", () => {
    const prompt = buildCoverSourcePrompt(DIRECTIVE);
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(200);
  });

  it("injects the colorization directive verbatim", () => {
    const prompt = buildCoverSourcePrompt(DIRECTIVE);
    expect(prompt).toContain(DIRECTIVE);
  });

  it("reserves an upper title-safe area (30-45%)", () => {
    const prompt = buildCoverSourcePrompt(DIRECTIVE);
    expect(prompt.toLowerCase()).toMatch(/title-safe/);
    expect(prompt).toMatch(/30[–-]45%/);
  });

  it("keeps the main illustration in the lower band (55-70%)", () => {
    const prompt = buildCoverSourcePrompt(DIRECTIVE);
    expect(prompt).toMatch(/55[–-]70%/);
  });

  it("instructs a sparse background pattern from the artwork's own motifs", () => {
    const prompt = buildCoverSourcePrompt(DIRECTIVE);
    expect(prompt.toLowerCase()).toMatch(/motif/);
    expect(prompt.toLowerCase()).toMatch(/pattern/);
    expect(prompt.toLowerCase()).toMatch(/sparse|sparsely/);
  });

  it("forbids any text / typography (text-free cover source)", () => {
    const prompt = buildCoverSourcePrompt(DIRECTIVE);
    const lower = prompt.toLowerCase();
    expect(lower).toMatch(/no title|do not draw any text|any text:/);
    expect(lower).toMatch(/watermark/);
    expect(lower).toMatch(/logo/);
  });

  it("requires preserving the original subjects and line-art style", () => {
    const prompt = buildCoverSourcePrompt(DIRECTIVE);
    const lower = prompt.toLowerCase();
    expect(lower).toMatch(/preserve|keep the original/);
    expect(lower).toMatch(/line-art|line art/);
  });
});
