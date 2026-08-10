import { describe, it, expect } from "vitest";
import { deriveBookPageLabel, bookPageTone, type BookPageMetaInput } from "./book-page-label";

describe("deriveBookPageLabel", () => {
  const interior: BookPageMetaInput[] = [
    { sourcePageNumber: 12, origin: "original" },
    { origin: "additional", parentPageNumber: 12 },
    { origin: "additional", parentPageNumber: 12 },
    { origin: "additional", parentPageNumber: 8 },
    {}, // legacy page: no metadata
  ];

  it("labels an original by its inherited source page number", () => {
    expect(deriveBookPageLabel(interior[0], 0, interior)).toEqual({
      displayNumber: "#12",
      isAdditional: false,
    });
  });

  it("numbers additionals per-parent as #<parent>·A<n>", () => {
    expect(deriveBookPageLabel(interior[1], 1, interior).displayNumber).toBe("#12·A1");
    expect(deriveBookPageLabel(interior[2], 2, interior).displayNumber).toBe("#12·A2");
    expect(deriveBookPageLabel(interior[1], 1, interior).isAdditional).toBe(true);
  });

  it("restarts the A-counter for a different parent", () => {
    expect(deriveBookPageLabel(interior[3], 3, interior).displayNumber).toBe("#8·A1");
  });

  it("falls back to positional number when metadata is absent (pre-D4a books)", () => {
    expect(deriveBookPageLabel(interior[4], 4, interior)).toEqual({
      displayNumber: "#5",
      isAdditional: false,
    });
  });
});

describe("bookPageTone", () => {
  it("maps cover/intro sections regardless of page origin", () => {
    expect(bookPageTone("cover", {})).toBe("cover");
    expect(bookPageTone("intro", {})).toBe("intro");
  });
  it("splits interior by origin", () => {
    expect(bookPageTone("interior", { origin: "original" })).toBe("interior");
    expect(bookPageTone("interior", {})).toBe("interior");
    expect(bookPageTone("interior", { origin: "additional", parentPageNumber: 3 })).toBe("additional");
  });
});
