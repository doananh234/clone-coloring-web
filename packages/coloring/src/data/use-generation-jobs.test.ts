import { describe, it, expect } from "vitest";
import { generationPollInterval } from "./use-generation-jobs";

describe("generationPollInterval", () => {
  it("does not poll when nothing is active (enqueue invalidates to wake it)", () => {
    expect(generationPollInterval({ open: false, hasActive: false })).toBe(false);
    // Even with the drawer open, an empty/idle queue needs no polling.
    expect(generationPollInterval({ open: true, hasActive: false })).toBe(false);
  });

  it("polls fast only while the drawer is open AND a job is active", () => {
    expect(generationPollInterval({ open: true, hasActive: true })).toBe(4000);
  });

  it("polls gently when a job is active but the drawer is closed (keep badge live)", () => {
    expect(generationPollInterval({ open: false, hasActive: true })).toBe(20000);
  });
});
