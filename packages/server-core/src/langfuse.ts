import { Langfuse } from "langfuse";

/**
 * Langfuse singleton — AI observability & cost tracking.
 *
 * Env vars (add to .env.local):
 *   LANGFUSE_PUBLIC_KEY=pk-...
 *   LANGFUSE_SECRET_KEY=sk-...
 *   LANGFUSE_BASE_URL=https://cloud.langfuse.com  (or self-hosted URL)
 *
 * If keys are not set, returns a no-op stub so the app works without Langfuse.
 */

let _instance: Langfuse | null = null;

export function getLangfuse(): Langfuse | null {
  if (_instance) return _instance;

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;

  if (!publicKey || !secretKey) {
    console.warn("[langfuse] Not configured — set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY in .env.local");
    return null;
  }

  _instance = new Langfuse({
    publicKey,
    secretKey,
    baseUrl: process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com",
  });

  console.log("[langfuse] Initialized →", process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com");
  return _instance;
}

/**
 * Flush pending events. Call in API routes before returning response
 * to ensure traces are sent in serverless environments.
 */
export async function flushLangfuse(): Promise<void> {
  const lf = getLangfuse();
  if (lf) await lf.flushAsync();
}
