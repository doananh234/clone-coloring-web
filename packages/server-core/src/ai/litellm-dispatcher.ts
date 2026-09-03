import { readFileSync } from "node:fs";
import { rootCertificates } from "node:tls";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, resolve } from "node:path";
import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";

// This file lives at packages/server-core/src/ai/ → four levels up is the repo
// root, so a RELATIVE LITELLM_CA_CERT (e.g. "certs/foo.pem") resolves the same
// no matter which app's cwd (apps/worker vs apps/admin) loads it.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * TLS handling for LiteLLM calls ONLY. The new LiteLLM domain serves a
 * self-signed / privately-signed cert that Node's default trust store rejects
 * ("self-signed certificate"), which fails every image/text call.
 *
 * Two opt-in env knobs (checked once, lazily):
 *   LITELLM_TLS_INSECURE=true   → skip cert verification (DEV convenience).
 *   LITELLM_CA_CERT=/path.pem   → trust this CA on TOP of the system roots
 *                                 (PROD-safe: verification still on).
 *
 * The Agent is applied ONLY to litellmFetch(), so every other HTTPS call (R2,
 * Firebase, Telegram, Google) keeps full certificate verification.
 */
let dispatcher: Agent | null | undefined; // undefined = not built yet, null = none

function build(): Agent | null {
  if (process.env.LITELLM_TLS_INSECURE === "true") {
    console.warn("[litellm-tls] LITELLM_TLS_INSECURE=true — certificate verification DISABLED for LiteLLM calls");
    return new Agent({ connect: { rejectUnauthorized: false } });
  }
  const caPath = process.env.LITELLM_CA_CERT;
  if (caPath) {
    const abs = isAbsolute(caPath) ? caPath : resolve(REPO_ROOT, caPath);
    const pem = readFileSync(abs, "utf8");
    return new Agent({ connect: { ca: [...rootCertificates, pem] } });
  }
  return null;
}

function getDispatcher(): Agent | undefined {
  if (dispatcher === undefined) {
    try {
      dispatcher = build();
    } catch (e) {
      console.warn("[litellm-tls] failed to init TLS dispatcher:", e instanceof Error ? e.message : e);
      dispatcher = null;
    }
  }
  return dispatcher ?? undefined;
}

/**
 * fetch() for LiteLLM endpoints — applies the custom TLS dispatcher when
 * configured. Returned value is shape-compatible with the global fetch Response
 * (.ok/.status/.json()/.text()/.headers), so callers need no other change.
 */
export async function litellmFetch(url: string, init?: RequestInit): Promise<Response> {
  const d = getDispatcher();
  const opts = (d ? { ...init, dispatcher: d } : init) as UndiciRequestInit;
  const res = await undiciFetch(url, opts);
  return res as unknown as Response;
}
