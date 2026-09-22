import { describe, it, expect } from "vitest";
import { buildIntroRegenPrompt } from "./intro-regen-prompt";
import { KDP_FRAME_INSTRUCTION } from "./frame";

/**
 * KingCong's capPrompt() truncates over 4000 chars and counts a newline as CRLF.
 * The prompt this replaces was 4007 chars, so its tail — the whole text-page rule
 * set — was silently cut before the request was sent. That is the regression this
 * file exists to prevent, so both variants are pinned against the real budget.
 */
const KINGCONG_BUDGET = 4000;
const kingcongLength = (s: string) => s.length + (s.match(/\n/g)?.length ?? 0);

const title = buildIntroRegenPrompt({ variant: "title", title: "Dinosaur Adventures", subtitle: "50 Fun Pages" });
const text = buildIntroRegenPrompt({ variant: "text" });

describe("buildIntroRegenPrompt — KingCong budget", () => {
  it("keeps the title variant under the truncation point", () => {
    expect(kingcongLength(title)).toBeLessThan(KINGCONG_BUDGET);
  });

  it("keeps the text variant under the truncation point", () => {
    expect(kingcongLength(text)).toBeLessThan(KINGCONG_BUDGET);
  });

  it("stays under budget even with a long title and subtitle", () => {
    const long = buildIntroRegenPrompt({
      variant: "title",
      title: "A".repeat(300),
      subtitle: "B".repeat(300),
    });
    expect(kingcongLength(long)).toBeLessThan(KINGCONG_BUDGET);
  });
});

describe("buildIntroRegenPrompt — title variant", () => {
  it("quotes the title and subtitle so the model spells them correctly", () => {
    expect(title).toContain('- Title: "Dinosaur Adventures"');
    expect(title).toContain('- Subtitle: "50 Fun Pages"');
  });

  it("always asks for the copyright line to be copied from the source", () => {
    expect(title).toContain("- Copyright line: reproduce it word-for-word from the source image.");
  });

  it("omits the subtitle line when there is no subtitle", () => {
    const p = buildIntroRegenPrompt({ variant: "title", title: "Solo" });
    expect(p).toContain('- Title: "Solo"');
    expect(p).not.toContain("- Subtitle:");
  });

  it("omits the subtitle line when the subtitle is blank", () => {
    const p = buildIntroRegenPrompt({ variant: "title", title: "Solo", subtitle: "   " });
    expect(p).not.toContain("- Subtitle:");
  });

  it("omits the title line when there is no title", () => {
    const p = buildIntroRegenPrompt({ variant: "title" });
    expect(p).not.toContain("- Title:");
    expect(p).toContain("- Copyright line:");
  });

  it("trims surrounding whitespace off the inlined strings", () => {
    const p = buildIntroRegenPrompt({ variant: "title", title: "  Padded  " });
    expect(p).toContain('- Title: "Padded"');
  });

  it("defaults the variation budget to 55%", () => {
    expect(title).toContain("~55% change");
  });

  it("uses a supplied changePercent", () => {
    expect(buildIntroRegenPrompt({ variant: "title", changePercent: 40 })).toContain("~40% change");
  });

  it("falls back to 55% for a zero changePercent", () => {
    expect(buildIntroRegenPrompt({ variant: "title", changePercent: 0 })).toContain("~55% change");
  });
});

describe("buildIntroRegenPrompt — text variant", () => {
  it("is a faithful reproduction, not a variation", () => {
    expect(text).toContain("NOT a creative variation");
    expect(text).not.toContain("% change");
  });

  it("never names the book, even when title and subtitle are passed", () => {
    const p = buildIntroRegenPrompt({ variant: "text", title: "Dinosaur Adventures", subtitle: "50 Fun Pages" });
    expect(p).not.toContain("Dinosaur Adventures");
    expect(p).not.toContain("50 Fun Pages");
  });

  it("forbids adding an illustration", () => {
    expect(text).toContain("add any illustration");
  });
});

describe("buildIntroRegenPrompt — not an interior page", () => {
  it("never appends the KDP colouring frame", () => {
    expect(title).not.toContain(KDP_FRAME_INSTRUCTION);
    expect(text).not.toContain(KDP_FRAME_INSTRUCTION);
  });
});
