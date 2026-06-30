/**
 * Diaflow rate limiter — sliding 1h window, shared across admin + worker via Redis.
 *
 * Diaflow's documented cap is 200 in-flight runs per builder. We treat it as a
 * conservative ~190/hour ceiling on `createSession` to leave headroom for
 * other Diaflow consumers and for our own retry-once logic.
 *
 * Storage: Redis ZSET `diaflow:rate:1h`. Each createSession adds one member
 * scored by Date.now(); expired members are trimmed on every check.
 *
 * Tuning: env var `DIAFLOW_RATE_LIMIT` overrides the default 190.
 */

import { Redis } from "ioredis";

const KEY = "diaflow:rate:1h";
const WINDOW_MS = 3_600_000; // 1 hour
const DEFAULT_MAX = 190;
const MAX_WAIT_ITERATIONS = 120; // safety bound — at worst ~2h of waiting
const PER_WAIT_CAP_MS = 60_000; // never sleep more than 60s per iteration

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (_redis) return _redis;
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL required for Diaflow rate limiter");
  }
  _redis = new Redis(url, { maxRetriesPerRequest: null });
  return _redis;
}

function getMax(): number {
  const env = Number(process.env.DIAFLOW_RATE_LIMIT);
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_MAX;
}

/**
 * Block until a Diaflow API slot is available within the rolling 1h window.
 * Records the reservation atomically so admin + worker share the same budget.
 */
export async function awaitDiaflowSlot(): Promise<void> {
  const redis = getRedis();
  const max = getMax();

  for (let i = 0; i < MAX_WAIT_ITERATIONS; i++) {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;

    // Trim expired entries, then count remaining in-window calls.
    await redis.zremrangebyscore(KEY, "-inf", cutoff);
    const count = await redis.zcard(KEY);

    if (count < max) {
      const member = `${now}:${Math.random().toString(36).slice(2, 10)}`;
      await redis.zadd(KEY, now, member);
      await redis.expire(KEY, Math.ceil(WINDOW_MS / 1000));
      return;
    }

    // Over limit — sleep until the oldest entry falls out of the window.
    const oldest = await redis.zrange(KEY, 0, 0, "WITHSCORES");
    const oldestTs = oldest.length >= 2 ? parseInt(oldest[1], 10) : now;
    const waitMs = Math.min(
      PER_WAIT_CAP_MS,
      Math.max(1000, WINDOW_MS - (now - oldestTs) + 100),
    );
    console.warn(
      `[Diaflow] Rate limit hit (${count}/${max} in 1h). Sleeping ${Math.round(waitMs / 1000)}s.`,
    );
    await new Promise((r) => setTimeout(r, waitMs));
  }

  throw new Error(
    "Diaflow rate limiter: exhausted retries while waiting for a slot — investigate stuck/long-running calls",
  );
}
