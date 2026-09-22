import { describe, it, expect } from "vitest";
import { pickSourceCoverPage } from "./source-cover";

const page = (pageNumber: number, extra: Record<string, unknown> = {}) => ({
  pageNumber,
  imageUrl: `/assets/clone-jobs/j/p${pageNumber}.png`,
  ...extra,
});

describe("pickSourceCoverPage", () => {
  it("picks the page classified as cover", () => {
    const pages = [page(1), page(2, { pageType: "cover" }), page(3)];
    expect(pickSourceCoverPage(pages)?.pageNumber).toBe(2);
  });

  it("falls back to the lowest-numbered original page when none is classified", () => {
    const pages = [page(3), page(1), page(2)];
    expect(pickSourceCoverPage(pages)?.pageNumber).toBe(1);
  });

  it("skips excluded, errored and imageless pages", () => {
    const pages = [
      page(1, { pageType: "cover", excluded: true }),
      page(2, { status: "error" }),
      page(3, { imageUrl: "" }),
      page(4),
    ];
    expect(pickSourceCoverPage(pages)?.pageNumber).toBe(4);
  });

  it("never falls back to a page cloned by fill-interior", () => {
    const pages = [page(1, { origin: "additional" }), page(2, { origin: "original" })];
    expect(pickSourceCoverPage(pages)?.pageNumber).toBe(2);
  });

  it("returns null when nothing is usable", () => {
    expect(pickSourceCoverPage([])).toBeNull();
    expect(pickSourceCoverPage([page(1, { excluded: true })])).toBeNull();
  });
});
