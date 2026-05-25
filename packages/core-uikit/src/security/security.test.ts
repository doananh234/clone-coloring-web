import { describe, it, expect, vi, beforeEach } from "vitest";
import { maskSensitive } from "./sanitize";
import { deduplicateRequest } from "./dedup";

describe("maskSensitive", () => {
  it("masks short values entirely", () => {
    expect(maskSensitive("ab")).toBe("**");
    expect(maskSensitive("abc")).toBe("***");
  });

  it("keeps first 3 chars and masks the rest", () => {
    expect(maskSensitive("secret")).toBe("sec***");
    expect(maskSensitive("password123")).toBe("pas********");
  });
});

describe("deduplicateRequest", () => {
  beforeEach(() => {
    // reset module-level Map by re-importing won't work easily; test behavior directly
  });

  it("returns same promise for concurrent requests with same key", () => {
    const fn = vi.fn(() => Promise.resolve("data"));
    const p1 = deduplicateRequest("key-a", fn);
    const p2 = deduplicateRequest("key-a", fn);
    expect(p1).toBe(p2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("calls requestFn again after previous promise resolves", async () => {
    const fn = vi.fn(() => Promise.resolve("data"));
    await deduplicateRequest("key-b", fn);
    await deduplicateRequest("key-b", fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("propagates resolved value", async () => {
    const result = await deduplicateRequest("key-c", () => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it("propagates rejection", async () => {
    const err = new Error("fail");
    await expect(
      deduplicateRequest("key-d", () => Promise.reject(err))
    ).rejects.toThrow("fail");
  });
});
