import type { CloneStep } from "./types";

export const RETRY_POLICY = {
  maxAttempts: 5,
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
}

interface RetryCtx {
  recordRetry(step: CloneStep, attempt: number, error: unknown): Promise<void>;
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
  for (let attempt = 1; attempt <= RETRY_POLICY.maxAttempts; attempt++) {
    try {
      const result = await fn();
      await sleep(RETRY_POLICY.interStepCooldownMs);
      return result;
    } catch (err) {
      lastErr = err;
      await ctx.recordRetry(step, attempt, err);
      if (attempt === RETRY_POLICY.maxAttempts) break;
      const expDelay = RETRY_POLICY.baseDelayMs * 2 ** (attempt - 1);
      const capped = Math.min(expDelay, RETRY_POLICY.maxDelayMs);
      const jitter = random() * RETRY_POLICY.jitterMs;
      await sleep(capped + jitter);
    }
  }
  throw new StepFailedError(step, lastErr);
}
