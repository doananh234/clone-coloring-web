/**
 * Tests for Diaflow key rotation. REDIS_URL is left unset so the shared
 * cooldown registry degrades to an in-process no-op — rotation logic is
 * exercised without a live Redis.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DiaflowCreditExhaustedError,
  detectCreditExhaustion,
  getScopeTokens,
  withDiaflowKeyRotation,
} from "./diaflow-key-rotation";

const DIAFLOW_ENV_KEYS = [
  "REDIS_URL",
  "DIAFLOW_TOKENS",
  "DIAFLOW_TOKEN",
  "DIAFLOW_ONE_SHOT_TOKENS",
  "DIAFLOW_ONE_SHOT_TOKEN",
  "DIAFLOW_CREDIT_ERROR_KEYWORDS",
  "DIAFLOW_KEY_COOLDOWN_SECONDS",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of DIAFLOW_ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of DIAFLOW_ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("getScopeTokens", () => {
  it("parses a comma-separated pool and trims whitespace", () => {
    process.env.DIAFLOW_TOKENS = " a , b ,c ";
    expect(getScopeTokens("default")).toEqual(["a", "b", "c"]);
  });

  it("appends the single DIAFLOW_TOKEN and de-duplicates", () => {
    process.env.DIAFLOW_TOKENS = "a,b";
    process.env.DIAFLOW_TOKEN = "b"; // duplicate should collapse
    expect(getScopeTokens("default")).toEqual(["a", "b"]);
  });

  it("falls back to the single DIAFLOW_TOKEN when TOKENS unset", () => {
    process.env.DIAFLOW_TOKEN = "solo";
    expect(getScopeTokens("default")).toEqual(["solo"]);
  });

  it("one-shot uses its own pool when set", () => {
    process.env.DIAFLOW_TOKENS = "def";
    process.env.DIAFLOW_ONE_SHOT_TOKENS = "os1,os2";
    expect(getScopeTokens("one-shot")).toEqual(["os1", "os2"]);
  });

  it("one-shot falls back to the default pool when its own pool is empty", () => {
    process.env.DIAFLOW_TOKENS = "def1,def2";
    expect(getScopeTokens("one-shot")).toEqual(["def1", "def2"]);
  });
});

describe("detectCreditExhaustion", () => {
  it("flags auth/payment status codes", () => {
    expect(detectCreditExhaustion(401)).toBe(true);
    expect(detectCreditExhaustion(402)).toBe(true);
    expect(detectCreditExhaustion(403)).toBe(true);
  });

  it("flags credit keywords in the body regardless of status", () => {
    expect(detectCreditExhaustion(400, "Your account has insufficient credit")).toBe(true);
    expect(detectCreditExhaustion(500, "quota exceeded for this key")).toBe(true);
  });

  it("respects extra keywords from env", () => {
    process.env.DIAFLOW_CREDIT_ERROR_KEYWORDS = "flooble";
    expect(detectCreditExhaustion(400, "the FLOOBLE ran dry")).toBe(true);
  });

  it("does not flag unrelated errors", () => {
    expect(detectCreditExhaustion(400, "bad request: missing field")).toBe(false);
    expect(detectCreditExhaustion(500)).toBe(false);
  });

  it("never flags 429 as out-of-credit (it is the concurrency/rate-limit counter)", () => {
    // 429 is temporary — the rate limiter handles it. Even a body that happens
    // to contain a credit keyword must NOT trigger a key rotation.
    expect(detectCreditExhaustion(429)).toBe(false);
    expect(detectCreditExhaustion(429, "quota exceeded, please retry later")).toBe(false);
  });

  it("never flags other transient codes (408/502/503/504)", () => {
    for (const status of [408, 502, 503, 504]) {
      expect(detectCreditExhaustion(status, "insufficient credit")).toBe(false);
    }
  });
});

describe("withDiaflowKeyRotation", () => {
  it("uses the first token and does not rotate on success", async () => {
    process.env.DIAFLOW_TOKENS = "a,b,c";
    const seen: string[] = [];
    const result = await withDiaflowKeyRotation("default", async (token) => {
      seen.push(token);
      return `ok:${token}`;
    });
    expect(result).toBe("ok:a");
    expect(seen).toEqual(["a"]);
  });

  it("rotates to the next token on credit exhaustion", async () => {
    process.env.DIAFLOW_TOKENS = "a,b,c";
    const seen: string[] = [];
    const result = await withDiaflowKeyRotation("default", async (token) => {
      seen.push(token);
      if (token !== "c") {
        throw new DiaflowCreditExhaustedError("out of credit", token);
      }
      return `ok:${token}`;
    });
    expect(result).toBe("ok:c");
    expect(seen).toEqual(["a", "b", "c"]);
  });

  it("throws when every token is exhausted", async () => {
    process.env.DIAFLOW_TOKENS = "a,b";
    const seen: string[] = [];
    await expect(
      withDiaflowKeyRotation("default", async (token) => {
        seen.push(token);
        throw new DiaflowCreditExhaustedError("out of credit", token);
      }),
    ).rejects.toThrow(/All Diaflow keys exhausted/);
    expect(seen).toEqual(["a", "b"]);
  });

  it("propagates non-credit errors without rotating", async () => {
    process.env.DIAFLOW_TOKENS = "a,b,c";
    const seen: string[] = [];
    await expect(
      withDiaflowKeyRotation("default", async (token) => {
        seen.push(token);
        throw new Error("network blip");
      }),
    ).rejects.toThrow("network blip");
    expect(seen).toEqual(["a"]); // no rotation on non-credit error
  });

  it("throws a config error when no tokens are set", async () => {
    await expect(
      withDiaflowKeyRotation("default", async () => "unreachable"),
    ).rejects.toThrow(/Diaflow not configured/);
  });
});
