import { describe, it, expect } from "vitest";
import { decideGateOutcome } from "./gate-decision";

describe("decideGateOutcome", () => {
  const interiors = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ pageNumber: i + 1, pageType: "interior" as const }));

  it("pauses for the operator when classification is not confirmed", () => {
    expect(decideGateOutcome(interiors(40), false)).toEqual({
      outcome: "await-classify",
    });
  });

  it("routes a confirmed job with 40 interiors to lane 1", () => {
    expect(decideGateOutcome(interiors(40), true)).toEqual({
      outcome: "proceed",
      lane: 1,
      interiorCount: 40,
    });
  });

  it("parks a confirmed job with 39 interiors in lane 2", () => {
    expect(decideGateOutcome(interiors(39), true)).toEqual({
      outcome: "await-fill",
      lane: 2,
      interiorCount: 39,
    });
  });

  it("counts only kept pages toward the lane decision", () => {
    const pages = [
      ...interiors(40),
      { pageNumber: 41, pageType: "interior" as const, excludedFromClone: true },
    ];
    expect(decideGateOutcome(pages, true)).toEqual({
      outcome: "proceed",
      lane: 1,
      interiorCount: 40,
    });
  });
});
