import { describe, it, expect } from "vitest";
import { planPageCount } from "./count-source-pages-plan";

describe("planPageCount", () => {
  it("parks a thin source and records its page count", () => {
    expect(planPageCount(30)).toEqual({ totalPages: 30, status: "insufficient-pages" });
  });

  it("keeps a thick enough source in the queue, only filling the count", () => {
    expect(planPageCount(42)).toEqual({ totalPages: 42 });
    expect(planPageCount(120)).toEqual({ totalPages: 120 });
  });

  it("refuses a nonsense page count instead of parking the job", () => {
    expect(planPageCount(0)).toBeNull();
    expect(planPageCount(-1)).toBeNull();
    expect(planPageCount(Number.NaN)).toBeNull();
  });

  it("honours a custom threshold", () => {
    expect(planPageCount(45, 50)).toEqual({ totalPages: 45, status: "insufficient-pages" });
    expect(planPageCount(45, 40)).toEqual({ totalPages: 45 });
  });
});
