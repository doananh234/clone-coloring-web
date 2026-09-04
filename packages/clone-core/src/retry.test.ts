import { describe, it, expect, vi } from "vitest";
import { withRetry, isRateLimitError, RETRY_POLICY, StepFailedError } from "./retry";

const fakeCtx = () => ({
  recordRetry: vi.fn().mockResolvedValue(undefined),
});

const fakeDeps = (sequence: number[]) => {
  const sleep = vi.fn().mockResolvedValue(undefined);
  let i = 0;
  const random = vi.fn().mockImplementation(() => (sequence[i++] ?? 0));
  return { sleep, random };
};

describe("withRetry", () => {
  it("returns the value on first success", async () => {
    const ctx = fakeCtx();
    const deps = fakeDeps([]);
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry("analyze", fn, ctx, deps);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(ctx.recordRetry).not.toHaveBeenCalled();
    expect(deps.sleep).toHaveBeenCalledWith(RETRY_POLICY.interStepCooldownMs);
  });

  it("retries with exponential backoff capped at maxDelayMs", async () => {
    const ctx = fakeCtx();
    const deps = fakeDeps([0, 0, 0, 0]);
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("boom1"))
      .mockRejectedValueOnce(new Error("boom2"))
      .mockResolvedValue("eventually");
    const result = await withRetry("analyze", fn, ctx, deps);
    expect(result).toBe("eventually");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(ctx.recordRetry).toHaveBeenCalledTimes(2);
    const sleepDelays = deps.sleep.mock.calls.map((c) => c[0]);
    // first retry waits ~10s, second waits ~20s, then a final cooldown 5s
    expect(sleepDelays).toEqual([10_000, 20_000, RETRY_POLICY.interStepCooldownMs]);
  });

  it("throws StepFailedError after maxAttempts", async () => {
    const ctx = fakeCtx();
    const deps = fakeDeps([0, 0, 0, 0, 0]);
    const fn = vi.fn().mockRejectedValue(new Error("nope"));
    await expect(withRetry("analyze", fn, ctx, deps)).rejects.toBeInstanceOf(StepFailedError);
    expect(fn).toHaveBeenCalledTimes(RETRY_POLICY.maxAttempts);
    expect(ctx.recordRetry).toHaveBeenCalledTimes(RETRY_POLICY.maxAttempts);
  });

  it("caps backoff at maxDelayMs", async () => {
    const ctx = fakeCtx();
    const deps = fakeDeps([0, 0, 0, 0, 0]);
    const fn = vi.fn().mockRejectedValue(new Error("nope"));
    await expect(withRetry("analyze", fn, ctx, deps)).rejects.toThrow();
    const sleepDelays = deps.sleep.mock.calls.map((c) => c[0]);
    // attempts 1..5: backoff is between attempts only -> 4 sleeps
    // 10_000, 20_000, 40_000, 80_000 (all below 300_000 cap)
    expect(sleepDelays).toEqual([10_000, 20_000, 40_000, 80_000]);
  });

  it("adds jitter from random() * jitterMs", async () => {
    const ctx = fakeCtx();
    const deps = fakeDeps([0.5]);
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("a"))
      .mockResolvedValue("ok");
    await withRetry("analyze", fn, ctx, deps);
    const firstSleep = deps.sleep.mock.calls[0][0];
    expect(firstSleep).toBe(10_000 + 0.5 * RETRY_POLICY.jitterMs);
  });
});

describe("isRateLimitError", () => {
  it("detects HTTP 429 on Response-like objects", () => {
    expect(isRateLimitError({ status: 429 })).toBe(true);
  });
  it("detects RESOURCE_EXHAUSTED in message", () => {
    expect(isRateLimitError(new Error("RESOURCE_EXHAUSTED: quota"))).toBe(true);
  });
  it("returns false otherwise", () => {
    expect(isRateLimitError(new Error("bad request"))).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
  });
});
