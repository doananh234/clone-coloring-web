import { describe, it, expect } from "vitest";
import { classifyPage } from "./classify-page";

describe("classifyPage", () => {
  it("tags the LLM-flagged cover page as cover", () => {
    expect(classifyPage({ pageNumber: 4, isCover: true })).toEqual({
      pageType: "cover",
      excluded: false,
    });
  });

  it("falls back to page 1 as cover when the LLM did not flag one", () => {
    expect(classifyPage({ pageNumber: 1, isCover: false })).toEqual({
      pageType: "cover",
      excluded: false,
    });
  });

  it("does NOT make page 1 a cover when another page was already flagged cover", () => {
    expect(
      classifyPage({ pageNumber: 1, isCover: false, coverAlreadyAssigned: true }),
    ).toEqual({ pageType: "interior", excluded: false });
  });

  it("treats every other page as interior, never excluded automatically", () => {
    expect(classifyPage({ pageNumber: 7 })).toEqual({
      pageType: "interior",
      excluded: false,
    });
  });
});
