import { describe, it, expect } from "vitest";
import { deriveAdditionalMeta, interiorProgress } from "./use-fill-interior";
import type { CloneJobPage } from "./types";

const p = (o: Partial<CloneJobPage> & { pageNumber: number }): CloneJobPage => ({
  imageUrl: "/x.png",
  status: "analyzed",
  ...o,
});

describe("deriveAdditionalMeta", () => {
  const pages: CloneJobPage[] = [
    p({ pageNumber: 12, pageType: "interior", origin: "original" }),
    p({ pageNumber: 41, pageType: "interior", origin: "additional", parentPageNumber: 12 }),
    p({ pageNumber: 42, pageType: "interior", origin: "additional", parentPageNumber: 12 }),
    p({ pageNumber: 43, pageType: "interior", origin: "additional", parentPageNumber: 8 }),
  ];

  it("labels an original by its own number", () => {
    expect(deriveAdditionalMeta(pages[0], pages)).toEqual({
      isAdditional: false,
      displayNumber: "#12",
      parentPageNumber: undefined,
    });
  });

  it("numbers additionals per-parent as #<parent>·A<n>", () => {
    expect(deriveAdditionalMeta(pages[1], pages).displayNumber).toBe("#12·A1");
    expect(deriveAdditionalMeta(pages[2], pages).displayNumber).toBe("#12·A2");
    // different parent restarts the counter
    expect(deriveAdditionalMeta(pages[3], pages).displayNumber).toBe("#8·A1");
  });
});

describe("interiorProgress", () => {
  it("counts interior pages that are not excluded", () => {
    const pages: CloneJobPage[] = [
      p({ pageNumber: 1, pageType: "cover" }),
      p({ pageNumber: 2, pageType: "interiorIntro" }),
      p({ pageNumber: 3, pageType: "interior" }),
      p({ pageNumber: 4, pageType: "interior", excluded: true }),
      p({ pageNumber: 5, origin: "additional", pageType: "interior", parentPageNumber: 3 }),
      p({ pageNumber: 6 }), // legacy undefined → interior
    ];
    expect(interiorProgress(pages).count).toBe(3); // pages 3, 5, 6
  });

  // Regression: the progress header must honour the operator's drop mark from
  // the pre-spend gate, not just the legacy `excluded` flag.
  it("counts a page dropped at the gate as dropped", () => {
    const pages: CloneJobPage[] = [
      p({ pageNumber: 1, pageType: "interior" }),
      p({ pageNumber: 2, pageType: "interior", excludedFromClone: true }),
      p({ pageNumber: 3, pageType: "interior" }),
    ];
    expect(interiorProgress(pages).count).toBe(2);
  });

  it("lets excludedFromClone: false override a stale legacy excluded: true", () => {
    const pages: CloneJobPage[] = [
      p({ pageNumber: 1, pageType: "interior", excluded: true, excludedFromClone: false }),
    ];
    expect(interiorProgress(pages).count).toBe(1);
  });
});
