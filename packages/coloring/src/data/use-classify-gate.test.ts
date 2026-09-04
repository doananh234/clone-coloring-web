import { describe, it, expect, vi, beforeEach } from "vitest";

const patch = vi.fn();
vi.mock("@vx/core-uikit/api", () => ({ httpPatch: (...a: unknown[]) => patch(...a) }));
vi.mock("./config", () => ({ COLORING_API_BASE: "/api", COLORING_WRITE_ENABLED: true }));

import { buildClassifyPayload } from "./use-classify-gate";

describe("buildClassifyPayload", () => {
  beforeEach(() => patch.mockReset());

  it("includes confirm flag and only edited fields", () => {
    const payload = buildClassifyPayload(
      [{ pageNumber: 1, pageType: "cover", excluded: false }],
      true,
    );
    expect(payload).toEqual({
      pages: [{ pageNumber: 1, pageType: "cover", excluded: false }],
      confirm: true,
    });
  });
});
