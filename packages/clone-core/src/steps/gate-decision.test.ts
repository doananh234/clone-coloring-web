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

  it("parks a confirmed job with 39 interiors in lane 2 — before any spend", () => {
    expect(decideGateOutcome(interiors(39), true, false)).toEqual({
      outcome: "await-fill",
      lane: 2,
      interiorCount: 39,
    });
  });

  it("defaults to the pre-spend park when the caller omits alreadySpent", () => {
    expect(decideGateOutcome(interiors(39), true)).toEqual({
      outcome: "await-fill",
      lane: 2,
      interiorCount: 39,
    });
  });

  // Regression: rows created before the gate moved ahead of `reproduce` were
  // confirmed DOWNSTREAM of the Diaflow call, so classifyConfirmed on them
  // implies the money is already spent. Parking such a job in `awaiting-fill`
  // strands purchased work — nothing un-parks it automatically.
  it("does NOT park a sub-40 job whose AI spend already happened", () => {
    expect(decideGateOutcome(interiors(39), true, true)).toEqual({
      outcome: "proceed",
      lane: 2,
      interiorCount: 39,
    });
  });

  it("still reports lane 2 + interiorCount when it lets an already-spent job through", () => {
    const decision = decideGateOutcome(interiors(12), true, true);
    expect(decision.outcome).toBe("proceed");
    expect(decision).toMatchObject({ lane: 2, interiorCount: 12 });
  });

  it("keeps waiting for the operator even when the spend already happened", () => {
    expect(decideGateOutcome(interiors(39), false, true)).toEqual({
      outcome: "await-classify",
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
