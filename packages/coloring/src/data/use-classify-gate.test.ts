import { describe, it, expect, vi, beforeEach } from "vitest";

const patch = vi.fn();
vi.mock("@vx/core-uikit/api", () => ({ httpPatch: (...a: unknown[]) => patch(...a) }));
vi.mock("./config", () => ({ COLORING_API_BASE: "/api", COLORING_WRITE_ENABLED: true }));

import { buildClassifyPayload, countInteriorPages } from "./use-classify-gate";

describe("buildClassifyPayload", () => {
  beforeEach(() => patch.mockReset());

  it("includes confirm flag and only edited fields", () => {
    const payload = buildClassifyPayload(
      [{ pageNumber: 1, pageType: "cover", excludedFromClone: false }],
      true,
    );
    expect(payload).toEqual({
      pages: [{ pageNumber: 1, pageType: "cover", excludedFromClone: false }],
      confirm: true,
    });
  });
});

describe("countInteriorPages", () => {
  it("counts kept pages that are not cover or intro", () => {
    expect(
      countInteriorPages([
        { pageNumber: 1, pageType: "cover", excludedFromClone: false },
        { pageNumber: 2, pageType: "interiorIntro", excludedFromClone: false },
        { pageNumber: 3, pageType: "interior", excludedFromClone: false },
        { pageNumber: 4, pageType: "interior", excludedFromClone: false },
      ]),
    ).toBe(2);
  });

  it("does not count dropped pages", () => {
    expect(
      countInteriorPages([
        { pageNumber: 1, pageType: "interior", excludedFromClone: false },
        { pageNumber: 2, pageType: "interior", excludedFromClone: true },
      ]),
    ).toBe(1);
  });
});
