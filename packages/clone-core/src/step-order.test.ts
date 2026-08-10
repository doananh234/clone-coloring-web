import { describe, it, expect } from "vitest";
import { STEP_ORDER } from "./types";

describe("STEP_ORDER", () => {
  it("places fill-interior between reproduce and create-book", () => {
    const i = STEP_ORDER.indexOf("fill-interior");
    expect(i).toBeGreaterThan(-1);
    expect(STEP_ORDER[i - 1]).toBe("reproduce");
    expect(STEP_ORDER[i + 1]).toBe("create-book");
  });
});
