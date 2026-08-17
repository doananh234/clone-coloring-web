/**
 * Diaflow API key rotation — multi-key failover on credit exhaustion.
 *
 * A single Diaflow account/token runs out of credit periodically. This module
 * lets us configure a POOL of tokens per scope and automatically rotate to the
 * next one when the active token is out of credit.
 *
 * How it works:
 *   1. `getScopeTokens(scope)` reads a comma-separated pool from env.
 *   2. `withDiaflowKeyRotation(scope, fn)` runs `fn(token)` with the first
 *      available token. If `fn` throws `DiaflowCreditExhaustedError`, the token
 *      is put in a shared Redis cooldown and `fn` is retried with the next
 *      token — until one succeeds or the pool is exhausted.
 *   3. `detectCreditExhaustion(status, body)` classifies a failed HTTP response
 *      as "out of credit" (broad: 401/402/403 or a keyword match in the body).
 *
 * Cooldown state lives in Redis so admin + worker share which keys are dead
 * (same pattern as diaflow-rate-limiter.ts).
 *
 * Config:
 *   DIAFLOW_TOKENS               — comma-separated default-scope pool.
 *                                  Falls back to single DIAFLOW_TOKEN.
 *   DIAFLOW_ONE_SHOT_TOKENS      — comma-separated one-shot pool.
 *                                  Falls back to DIAFLOW_ONE_SHOT_TOKEN,
 *                                  then to the default pool.
 *   DIAFLOW_KEY_COOLDOWN_SECONDS — cooldown per exhausted key (default 7200 = 2h).
 *   DIAFLOW_CREDIT_ERROR_KEYWORDS — extra comma-separated body substrings that
 *                                  mark a response as credit-exhausted.
 */

import { createHash } from "node:crypto";
import { Redis } from "ioredis";

export type DiaflowScope = "default" | "one-shot";

const DEFAULT_COOLDOWN_SECONDS = 7200; // 2h — matches observed Diaflow reset window

// Out-of-credit is a NON-transient error → signaled by 402 (Payment Required)
// or auth-style 401/403 when the account is disabled. Rotate on these.
const CREDIT_STATUS_CODES = new Set([401, 402, 403]);

// TRANSIENT codes must NEVER trigger rotation. 429 is the concurrency /
// rate-limit counter ("retry soon") handled by diaflow-rate-limiter.ts —
// treating it as out-of-credit would wrongly cool a healthy key for hours and,
// for webhook/trigger callers, cause infinite retries. 408/5xx are retried by
// pollOnce's own transient handling. These win over any keyword match below.
const NON_CREDIT_STATUS_CODES = new Set([408, 429, 502, 503, 504]);
const DEFAULT_CREDIT_KEYWORDS = [
  "credit",
  "quota",
  "insufficient",
  "balance",
  "payment",
  "out of credit",
  "no credit",
  "not enough",
  "run out",
];

/** Thrown when a Diaflow response indicates the active token is out of credit. */
export class DiaflowCreditExhaustedError extends Error {
  readonly token: string | undefined;
  constructor(message: string, token?: string) {
    super(message);
    this.name = "DiaflowCreditExhaustedError";
    this.token = token;
  }
}

// --- Token pool parsing ---

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function unique(tokens: string[]): string[] {
  return Array.from(new Set(tokens));
}

/**
 * Resolve the ordered token pool for a scope.
 *
 * default:  DIAFLOW_TOKENS (list) + DIAFLOW_TOKEN (single, appended)
 * one-shot: DIAFLOW_ONE_SHOT_TOKENS + DIAFLOW_ONE_SHOT_TOKEN, and if that pool
 *           is empty, falls back to the default pool (preserves legacy behavior
 *           where one-shot reused DIAFLOW_TOKEN when its own token was unset).
 */
export function getScopeTokens(scope: DiaflowScope): string[] {
  if (scope === "one-shot") {
    const oneShot = unique([
      ...parseList(process.env.DIAFLOW_ONE_SHOT_TOKENS),
      ...parseList(process.env.DIAFLOW_ONE_SHOT_TOKEN),
    ]);
    if (oneShot.length > 0) return oneShot;
    return getScopeTokens("default");
  }

  return unique([
    ...parseList(process.env.DIAFLOW_TOKENS),
    ...parseList(process.env.DIAFLOW_TOKEN),
  ]);
}

// --- Credit-exhaustion detection ---

function creditKeywords(): string[] {
  return [
    ...DEFAULT_CREDIT_KEYWORDS,
    ...parseList(process.env.DIAFLOW_CREDIT_ERROR_KEYWORDS).map((s) => s.toLowerCase()),
  ];
}

/**
 * Classify a failed Diaflow HTTP response as credit-exhausted (→ rotate key).
 *
 * Precedence:
 *   1. Transient codes (429/408/5xx) are NEVER credit — return false first, so
 *      a rate-limit body that happens to contain "quota" can't trigger a bogus
 *      rotation.
 *   2. Payment/auth codes (402/401/403) → credit-exhausted.
 *   3. Otherwise fall back to a keyword match in the body (safety net for
 *      providers that return 200/400 + an out-of-credit message).
 */
export function detectCreditExhaustion(status: number, bodyText?: string): boolean {
  if (NON_CREDIT_STATUS_CODES.has(status)) return false;
  if (CREDIT_STATUS_CODES.has(status)) return true;
  if (bodyText) {
    const lower = bodyText.toLowerCase();
    if (creditKeywords().some((k) => lower.includes(k))) return true;
  }
  return false;
}

// --- Redis-backed cooldown registry ---

let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.REDIS_URL;
  if (!url) return null; // No Redis — rotation still works in-process, just no cross-process sharing.
  _redis = new Redis(url, { maxRetriesPerRequest: null });
  return _redis;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

function cooldownKey(scope: DiaflowScope, token: string): string {
  return `diaflow:key:cooldown:${scope}:${tokenHash(token)}`;
}

function cooldownSeconds(): number {
  const env = Number(process.env.DIAFLOW_KEY_COOLDOWN_SECONDS);
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_COOLDOWN_SECONDS;
}

/** Mask a token for logs — first 4 + last 4 chars only. */
export function maskToken(token: string): string {
  if (token.length <= 10) return "****";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

async function markTokenExhausted(scope: DiaflowScope, token: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(cooldownKey(scope, token), "1", "EX", cooldownSeconds());
  } catch (err) {
    // Cooldown is a best-effort optimization — never let a Redis hiccup break
    // the actual Diaflow call path.
    console.warn(`[Diaflow] Failed to record key cooldown: ${(err as Error).message}`);
  }
}

async function isTokenCooled(scope: DiaflowScope, token: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    return (await redis.exists(cooldownKey(scope, token))) === 1;
  } catch {
    return false;
  }
}

/**
 * Pick the next token to try: first untried token that is NOT in cooldown.
 * If every untried token is cooled (cooldown may be stale), fall back to the
 * first untried token anyway so we never hard-block while keys remain.
 */
async function pickActiveToken(
  scope: DiaflowScope,
  tokens: string[],
  tried: Set<string>,
): Promise<string | null> {
  const candidates = tokens.filter((t) => !tried.has(t));
  if (candidates.length === 0) return null;
  for (const token of candidates) {
    if (!(await isTokenCooled(scope, token))) return token;
  }
  return candidates[0];
}

// --- Rotation runner ---

/**
 * Run `fn` with an active Diaflow token, rotating to the next token in the pool
 * whenever `fn` throws DiaflowCreditExhaustedError. All other errors propagate
 * immediately (no rotation).
 *
 * IMPORTANT: `fn` must perform the WHOLE logical operation (upload + process)
 * with the token it receives — Diaflow uploads are account-scoped, so a file
 * uploaded with token A is invisible to token B. Wrapping the full op keeps
 * upload + process on the same account across a rotation.
 */
export async function withDiaflowKeyRotation<T>(
  scope: DiaflowScope,
  fn: (token: string) => Promise<T>,
): Promise<T> {
  const tokens = getScopeTokens(scope);
  if (tokens.length === 0) {
    const envName =
      scope === "one-shot"
        ? "DIAFLOW_ONE_SHOT_TOKENS/DIAFLOW_ONE_SHOT_TOKEN (or DIAFLOW_TOKENS/DIAFLOW_TOKEN)"
        : "DIAFLOW_TOKENS (or DIAFLOW_TOKEN)";
    throw new Error(`Diaflow not configured. Set ${envName} in your environment.`);
  }

  const tried = new Set<string>();
  let lastError: unknown = null;

  for (let attempt = 0; attempt < tokens.length; attempt++) {
    const token = await pickActiveToken(scope, tokens, tried);
    if (!token) break;
    tried.add(token);

    try {
      return await fn(token);
    } catch (err) {
      if (err instanceof DiaflowCreditExhaustedError) {
        await markTokenExhausted(scope, token);
        lastError = err;
        const remaining = tokens.length - tried.size;
        console.warn(
          `[Diaflow] Key ${maskToken(token)} exhausted (scope=${scope}). ` +
            `${remaining > 0 ? `Rotating to next key (${remaining} left).` : "No keys left."}`,
        );
        continue;
      }
      throw err;
    }
  }

  if (lastError instanceof Error) {
    throw new Error(
      `All Diaflow keys exhausted for scope "${scope}" (${tokens.length} key(s) tried). ` +
        `Last error: ${lastError.message}`,
    );
  }
  throw new Error(
    `No available Diaflow key for scope "${scope}" — all ${tokens.length} key(s) in cooldown. Try again later.`,
  );
}
