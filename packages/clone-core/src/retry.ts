import type { CloneStep } from "./types";

/**
 * `CLONE_MAX_RETRY_ATTEMPTS` semantics:
 *   - unset / non-numeric  → default 5 attempts
 *   - `0`                  → 1 attempt (no retry after the first failure)
 *   - `N`                  → N attempts total
 * `0` is coerced to `1` because a `for` loop bounded by `0` never runs and
 * would surface an `undefined` cause via `StepFailedError`.
 */
function resolveMaxAttempts(): number {
  const raw = process.env.CLONE_MAX_RETRY_ATTEMPTS;
  if (raw == null || raw === "") return 5;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 5;
  return Math.max(1, Math.floor(n));
}

export const RETRY_POLICY = {
  maxAttempts: resolveMaxAttempts(),
  baseDelayMs: 10_000,
  maxDelayMs: 5 * 60_000,
  jitterMs: 2_000,
  interStepCooldownMs: 5_000,
} as const;

export class StepFailedError extends Error {
  constructor(public step: CloneStep, public override cause: unknown) {
    super(`step ${step} failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "StepFailedError";
  }
}

export function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; message?: string };
  if (e.status === 429) return true;
  if (typeof e.message === "string" && e.message.includes("RESOURCE_EXHAUSTED")) return true;
  return false;
}

interface RetryDeps {
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** Wall-clock budget for this step, surfaced to the UI as a denominator. */
  budgetSec?: number;
}

interface RetryCtx {
  recordRetry(step: CloneStep, attempt: number, error: unknown): Promise<void>;
  /** Publish "this step is running now" so the UI can show it with a clock. */
  markStepRunning(step: CloneStep, budgetSec?: number): Promise<void>;
  clearStepRunning(): Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function withRetry<T>(
  step: CloneStep,
  fn: () => Promise<T>,
  ctx: RetryCtx,
  deps: RetryDeps = {},
): Promise<T> {
  const sleep = deps.sleep ?? defaultSleep;
  const random = deps.random ?? Math.random;

  let lastErr: unknown;
  try {
  for (let attempt = 1; attempt <= RETRY_POLICY.maxAttempts; attempt++) {
    try {
      // Re-marked per attempt: a retry starts the work over, so the clock the
      // operator sees must restart with it.
      await ctx.markStepRunning(step, deps.budgetSec);
      const result = await fn();
      await sleep(RETRY_POLICY.interStepCooldownMs);
      return result;
    } catch (err) {
      lastErr = err;
      // Surface the underlying failure per attempt so the worker terminal
      // shows *why* we're retrying, not just that we retried.
      const e = err as { message?: string; stack?: string; cause?: unknown; code?: string };
      console.error(
        `[withRetry] step=${step} attempt=${attempt}/${RETRY_POLICY.maxAttempts} code=${e.code ?? "-"} msg=${e.message ?? String(err)}`,
      );
      if (e.stack) console.error(e.stack);
      if (e.cause) console.error("cause:", e.cause);
      await ctx.recordRetry(step, attempt, err);
      if (attempt === RETRY_POLICY.maxAttempts) break;
      const expDelay = RETRY_POLICY.baseDelayMs * 2 ** (attempt - 1);
      const capped = Math.min(expDelay, RETRY_POLICY.maxDelayMs);
      const jitter = random() * RETRY_POLICY.jitterMs;
      await sleep(capped + jitter);
    }
  }
  throw new StepFailedError(step, lastErr);
  } finally {
    // Always clears — on success, on give-up, and on a non-retryable throw.
    // A stale runningStep would leave the UI counting up forever.
    await ctx.clearStepRunning();
  }
}
