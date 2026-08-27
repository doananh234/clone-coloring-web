import { describe, it, expect } from "vitest";
import { describeRunningStep } from "./describe-running-step";

const T0 = Date.parse("2026-08-27T06:58:12.000Z");
const at = (min: number) => T0 + min * 60_000;

describe("describeRunningStep", () => {
  it("returns null when no step is running", () => {
    expect(describeRunningStep(null, null, null, at(5))).toBeNull();
    expect(describeRunningStep(undefined, undefined, undefined, at(5))).toBeNull();
  });

  it("shows elapsed against the budget when both are known", () => {
    const v = describeRunningStep("reproduce", new Date(T0).toISOString(), 2400, at(16))!;
    expect(v.step).toBe("reproduce");
    expect(v.elapsedSec).toBe(16 * 60);
    expect(v.percent).toBe(40);
    expect(v.overBudget).toBe(false);
    expect(v.label).toBe("reproduce · 16/40 phút");
  });

  it("counts up without a denominator when no budget was published", () => {
    const v = describeRunningStep("render", new Date(T0).toISOString(), null, at(3))!;
    expect(v.percent).toBeNull();
    expect(v.label).toBe("render · đang chạy 3 phút");
  });

  it("reads under a minute as '<1 phút' rather than '0 phút'", () => {
    const v = describeRunningStep("trim-pdf", new Date(T0).toISOString(), null, T0 + 20_000)!;
    expect(v.label).toBe("trim-pdf · đang chạy <1 phút");
  });

  /** Server and browser clocks disagree; a negative age must not render. */
  it("clamps a future runningSince to zero elapsed", () => {
    const v = describeRunningStep("reproduce", new Date(at(5)).toISOString(), 2400, T0)!;
    expect(v.elapsedSec).toBe(0);
    expect(v.percent).toBe(0);
  });

  it("flags and caps an over-budget step instead of showing >100%", () => {
    const v = describeRunningStep("reproduce", new Date(T0).toISOString(), 2400, at(52))!;
    expect(v.overBudget).toBe(true);
    expect(v.percent).toBe(100);
    expect(v.label).toBe("reproduce · 52/40 phút — quá hạn");
  });

  it("shows the step with no clock when runningSince is missing", () => {
    const v = describeRunningStep("create-book", null, null, at(5))!;
    expect(v.elapsedSec).toBeNull();
    expect(v.label).toBe("create-book · đang chạy");
  });

  it("ignores a malformed runningSince rather than rendering NaN", () => {
    const v = describeRunningStep("reproduce", "not-a-date", 2400, at(5))!;
    expect(v.elapsedSec).toBeNull();
    expect(v.label).toBe("reproduce · đang chạy");
  });
});
