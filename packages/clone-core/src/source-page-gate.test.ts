import { describe, it, expect } from "vitest";
import { MIN_SOURCE_PAGES, INSUFFICIENT_PAGES_STATUS, isInsufficientSourcePages } from "./source-page-gate";

describe("isInsufficientSourcePages", () => {
  it("uses 42 as the minimum (40 interiors + cover + one intro)", () => {
    expect(MIN_SOURCE_PAGES).toBe(42);
    expect(INSUFFICIENT_PAGES_STATUS).toBe("insufficient-pages");
  });

  it("rejects below the threshold and accepts from it up", () => {
    expect(isInsufficientSourcePages(41)).toBe(true);
    expect(isInsufficientSourcePages(42)).toBe(false);
    expect(isInsufficientSourcePages(43)).toBe(false);
  });

  it("treats an unknown page count (0 / null) as NOT insufficient", () => {
    // 0 means "chưa đếm" — gating on it would park every freshly imported job.
    expect(isInsufficientSourcePages(0)).toBe(false);
    expect(isInsufficientSourcePages(null)).toBe(false);
    expect(isInsufficientSourcePages(undefined)).toBe(false);
  });

  it("honours an explicit threshold", () => {
    expect(isInsufficientSourcePages(45, 50)).toBe(true);
    expect(isInsufficientSourcePages(45, 40)).toBe(false);
  });
});
