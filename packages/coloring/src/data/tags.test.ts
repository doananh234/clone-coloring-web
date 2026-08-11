import { describe, it, expect } from "vitest";
import { normalizeTag, normalizeTags, collectTags } from "./tags";

describe("normalizeTag", () => {
  it("lowercases, trims, strips leading #, spaces→hyphen", () => {
    expect(normalizeTag("#Bold Easy")).toBe("bold-easy");
    expect(normalizeTag("  UPPER  ")).toBe("upper");
    expect(normalizeTag("a  b")).toBe("a-b");
    expect(normalizeTag("foo_bar")).toBe("foo-bar");
  });
  it("preserves unicode (Vietnamese)", () => {
    expect(normalizeTag("Trẻ Em")).toBe("trẻ-em");
  });
  it("collapses/trims hyphens and handles empties", () => {
    expect(normalizeTag("--x--")).toBe("x");
    expect(normalizeTag("#")).toBe("");
    expect(normalizeTag("   ")).toBe("");
    expect(normalizeTag("a---b")).toBe("a-b");
  });
});

describe("normalizeTags", () => {
  it("normalizes, drops empties, dedupes preserving first-seen order", () => {
    expect(normalizeTags(["#A", "a", "", "B", "b "])).toEqual(["a", "b"]);
    expect(normalizeTags(["Bold Easy", "bold-easy"])).toEqual(["bold-easy"]);
  });
});

describe("collectTags", () => {
  it("unions across items, normalizes, dedupes, sorts", () => {
    const items = [{ tags: ["Zebra", "#Bold Easy"] }, { tags: ["apple", "bold-easy"] }, {}];
    expect(collectTags(items)).toEqual(["apple", "bold-easy", "zebra"]);
  });
  it("handles items without tags", () => {
    expect(collectTags([{}, { tags: undefined }])).toEqual([]);
  });
});
