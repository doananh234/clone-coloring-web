import { describe, it, expect, vi, beforeEach } from "vitest";

const patch = vi.fn();
vi.mock("@vx/core-uikit/api", () => ({ httpPatch: (...a: unknown[]) => patch(...a) }));
vi.mock("./config", () => ({ COLORING_API_BASE: "/api", COLORING_WRITE_ENABLED: true }));

import { buildClassifyPayload, countInteriorPages, describeGateState } from "./use-classify-gate";

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

describe("describeGateState", () => {
  it("lane 1 while still awaiting classification — warns that confirming costs money", () => {
    const v = describeGateState("awaiting-classify", 41, 45);
    expect(v.parked).toBe(false);
    expect(v.lane).toBe(1);
    expect(v.tone).toBe("success");
    expect(v.banner).toContain("45");
    expect(v.parkedNotice).toBeUndefined();
    expect(v.confirmLabel).toBe("Xác nhận & tạo book");
  });

  it("lane 2 while still awaiting classification — promises no spend", () => {
    const v = describeGateState("awaiting-classify", 31, 33);
    expect(v.parked).toBe(false);
    expect(v.lane).toBe(2);
    expect(v.tone).toBe("warning");
    expect(v.banner).toContain("dưới 40");
    expect(v.parkedNotice).toBeUndefined();
  });

  /**
   * The bug this covers: after a successful confirm the worker parks the job in
   * `awaiting-fill`, but the classify tab stays mounted and re-rendered
   * identically — same grid, same future-tense banner, same button label. An
   * operator scrolled to the bottom of a 33-page grid saw nothing change and
   * reported the page as frozen.
   */
  it("parked — says the confirm already happened, in the past tense", () => {
    const v = describeGateState("awaiting-fill", 31, 33);
    expect(v.parked).toBe(true);
    expect(v.parkedNotice).toBeDefined();
    expect(v.parkedNotice).toContain("Đã xác nhận");
    expect(v.parkedNotice).not.toContain("sẽ");
    expect(v.confirmLabel).toBe("Xác nhận lại");
  });

  it("parked but re-classified up to lane 1 — banner warns the next confirm does spend", () => {
    const v = describeGateState("awaiting-fill", 41, 45);
    expect(v.parked).toBe(true);
    expect(v.lane).toBe(1);
    expect(v.banner).toContain("phát sinh chi phí");
  });
});

/**
 * The gate's park is a PRE-SPEND decision: decideGateOutcome() suppresses it
 * when the job's Diaflow call already happened. The banner used to compute lane
 * from interiorCount alone, so on those rows it promised "KHÔNG gọi Diaflow và
 * không tốn chi phí" for a job that would in fact proceed straight into
 * fill-interior + generate-cover. Five of the ten rows sitting at the gate in
 * production were in exactly that state.
 */
describe("describeGateState — alreadySpent", () => {
  it("lane 2 on a row whose AI spend already happened does NOT promise a free park", () => {
    const v = describeGateState("awaiting-classify", 36, 46, true);
    expect(v.lane).toBe(2);
    expect(v.willPark).toBe(false);
    expect(v.banner).not.toContain("không tốn chi phí");
    expect(v.banner).toContain("phát sinh chi phí");
    expect(v.tone).toBe("danger");
  });

  it("states how many interior pages the fill would still have to clone", () => {
    const v = describeGateState("awaiting-classify", 36, 46, true);
    expect(v.banner).toContain("tối đa 4 trang ruột");
  });

  it("lane 2 with no spend yet still promises the free park", () => {
    const v = describeGateState("awaiting-classify", 36, 46, false);
    expect(v.willPark).toBe(true);
    expect(v.banner).toContain("không tốn chi phí");
    expect(v.tone).toBe("warning");
  });

  it("lane 1 is unaffected by alreadySpent — it was always going to proceed", () => {
    const spent = describeGateState("awaiting-classify", 41, 45, true);
    const fresh = describeGateState("awaiting-classify", 41, 45, false);
    expect(spent.lane).toBe(1);
    expect(spent.willPark).toBe(false);
    expect(fresh.willPark).toBe(false);
    expect(spent.tone).toBe("success");
  });

  it("defaults to not-spent so an unmigrated caller keeps the old meaning", () => {
    expect(describeGateState("awaiting-classify", 36, 46).willPark).toBe(true);
  });
});
