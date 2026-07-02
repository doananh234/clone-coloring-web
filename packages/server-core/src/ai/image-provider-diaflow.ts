/**
 * Diaflow Provider — async session-based image + text generation.
 * Implements ImageProviderInterface and exports LLM functions.
 *
 * Input:  { flow: "image" | "text", request: string }
 *
 * Output (poll result.output node):
 *   - input_cf maps dynamic IDs to { title: "content"|"image", output_type: "text"|"image" }
 *   - Values at those dynamic IDs contain the actual text or CDN image path
 *
 * Config:
 *   DIAFLOW_API_URL   — Base URL (default: https://api.diaflow.io)
 *   DIAFLOW_TOKEN     — Bearer token (required)
 *   DIAFLOW_POLL_INTERVAL — Seconds between polls (default: 3)
 *   DIAFLOW_POLL_TIMEOUT  — Max seconds to wait (default: 300)
 */

import { getLangfuse } from "../langfuse";
import type {
  ColorizeOptions,
  GeneratedImage,
  ImageGenerationOptions,
  ImageProviderInterface,
  ImageUsage,
} from "./image-provider-types";

// --- Types ---

/**
 * Diaflow process payload. Two known shapes:
 *  - Legacy text/image flow:  { flow: "text" | "image", request: string }
 *  - File-input flow (clone): { file: string[] }
 * The API just JSON-serializes the body, so we keep this open-ended.
 */
type DiaflowPayload = Record<string, unknown>;

type DiaflowOutputField = {
  title: string;
  output_type: "text" | "image";
  [key: string]: unknown;
};

type DiaflowOutputNode = {
  input_cf?: Record<string, DiaflowOutputField>;
  [key: string]: unknown;
};

type DiaflowResponse = {
  status: "Processing" | "Done" | "Failed" | "Fail" | "Error";
  result?: Record<string, unknown>;
  error?: string;
};

/** Normalized extraction from Diaflow's dynamic output node */
type DiaflowExtracted = {
  content?: string;
  image?: string;
};

type DiaflowResult = {
  sessionId: string;
  extracted: DiaflowExtracted;
};

// --- Config ---

const DIAFLOW_CDN = (process.env.DIAFLOW_CDN_URL || "https://cdn.diaflow.io").replace(/\/$/, "");
const TRANSIENT_STATUS_CODES = [502, 503, 504];
const MAX_RETRIES = 3;

/**
 * Diaflow scopes — the one-shot clone flow lives on a separate Diaflow
 * account / interface and needs its own Bearer token. Existing image/text/
 * vision calls keep using the default scope.
 *
 *   default scope  → DIAFLOW_TOKEN          + DIAFLOW_API_URL
 *   "one-shot"     → DIAFLOW_ONE_SHOT_TOKEN + DIAFLOW_ONE_SHOT_API_URL
 *                    (falls back to DIAFLOW_TOKEN / DIAFLOW_API_URL if unset)
 */
type DiaflowScope = "default" | "one-shot";

function getConfig(scope: DiaflowScope = "default") {
  const isOneShot = scope === "one-shot";

  const apiUrl = (
    (isOneShot ? process.env.DIAFLOW_ONE_SHOT_API_URL : undefined) ||
    process.env.DIAFLOW_API_URL ||
    "https://api.diaflow.io"
  ).replace(/\/$/, "");

  const token =
    (isOneShot ? process.env.DIAFLOW_ONE_SHOT_TOKEN : undefined) ||
    process.env.DIAFLOW_TOKEN;

  // Timing differs by scope. The one-shot clone flow can take 30-40+ minutes
  // per PDF, so we sleep an initial fixed delay before the first poll —
  // every poll before that delay is guaranteed-Processing waste.
  //   default scope  → 0s   / 3s  / 300s   (fast image/text/vision turns)
  //   one-shot scope → 2400s / 30s / 3600s (40min warmup → poll → 1h timeout)
  const initialDelay = isOneShot
    ? Number(process.env.DIAFLOW_ONE_SHOT_INITIAL_DELAY) || 2400
    : 0;
  const pollInterval = isOneShot
    ? Number(process.env.DIAFLOW_ONE_SHOT_POLL_INTERVAL) || 30
    : Number(process.env.DIAFLOW_POLL_INTERVAL) || 3;
  const pollTimeout = isOneShot
    ? Number(process.env.DIAFLOW_ONE_SHOT_POLL_TIMEOUT) || 3600
    : Number(process.env.DIAFLOW_POLL_TIMEOUT) || 300;

  if (!token) {
    const envName = isOneShot ? "DIAFLOW_ONE_SHOT_TOKEN (or DIAFLOW_TOKEN)" : "DIAFLOW_TOKEN";
    throw new Error(`Diaflow not configured. Set ${envName} in .env.local`);
  }

  return { apiUrl, token, initialDelay, pollInterval, pollTimeout };
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "*/*",
  };
}

// --- Core client ---

async function createSession(payload: DiaflowPayload, token: string, apiUrl: string): Promise<string> {
  const url = `${apiUrl}/api/v1/interfaces/app/process`;
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Diaflow session creation failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  const sessionId = data.sessionId || data.session_id || data.id;
  if (!sessionId) {
    throw new Error(`Diaflow returned no session ID: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return sessionId;
}

async function pollOnce(sessionId: string, token: string, apiUrl: string): Promise<DiaflowResponse> {
  const url = `${apiUrl}/api/v1/interfaces/app/status/${sessionId}`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(url, { headers: authHeaders(token) });

    if (TRANSIENT_STATUS_CODES.includes(res.status)) {
      lastError = new Error(`Diaflow poll transient error (${res.status})`);
      await sleep(30000);
      continue;
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Diaflow poll error (${res.status}): ${err}`);
    }

    return (await res.json()) as DiaflowResponse;
  }

  throw lastError || new Error("Diaflow poll failed after retries");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFailed(status: string): boolean {
  return ["Failed", "Fail", "Error"].includes(status);
}

/**
 * Extract content and image from Diaflow's dynamic output node.
 *
 * The output node has:
 *   - input_cf: maps dynamic IDs → { title, output_type }
 *   - Dynamic numbered keys with actual values
 *
 * We match by output_type ("text" → content, "image" → image).
 */
function extractFromOutput(result: Record<string, unknown>): DiaflowExtracted {
  const outputNode = result["output"] as DiaflowOutputNode | undefined;
  if (!outputNode) {
    throw new Error(`No output node in Diaflow result: ${JSON.stringify(result).slice(0, 500)}`);
  }

  const extracted: DiaflowExtracted = {};
  const inputCf = outputNode.input_cf;

  if (inputCf) {
    for (const [fieldId, schema] of Object.entries(inputCf)) {
      const value = outputNode[fieldId];
      if (schema.output_type === "text" && typeof value === "string" && value.length > 0) {
        extracted.content = value;
      }
      if (schema.output_type === "image" && typeof value === "string" && value.length > 0) {
        extracted.image = value;
      }
    }
  }

  return extracted;
}

async function runDiaflow(payload: DiaflowPayload): Promise<DiaflowResult> {
  const { sessionId, result } = await runDiaflowRaw(payload);
  return { sessionId, extracted: extractFromOutput(result) };
}

/**
 * Lower-level Diaflow runner — returns the raw `result` object so callers
 * that don't fit the standard `{ content, image }` extraction (e.g. the
 * one-shot clone flow whose output is a stringified array under a dynamic
 * field id) can do their own parsing.
 */
async function runDiaflowRaw(
  payload: DiaflowPayload,
  scope: DiaflowScope = "default",
  options?: { returnPartialOnFailure?: boolean },
): Promise<{
  sessionId: string;
  result: Record<string, unknown>;
  failed?: boolean;
  failureError?: string;
}> {
  const { apiUrl, token, initialDelay, pollInterval, pollTimeout } = getConfig(scope);

  const sessionId = await createSession(payload, token, apiUrl);

  // One-shot clone runs ~30-40min — skip the wasteful early polls and
  // sleep a fixed initialDelay (default 40min) before the first status check.
  // Default scope keeps initialDelay = 0 so existing fast flows are unaffected.
  if (initialDelay > 0) {
    await sleep(initialDelay * 1000);
  }

  const deadline = Date.now() + pollTimeout * 1000;

  while (Date.now() < deadline) {
    const status = await pollOnce(sessionId, token, apiUrl);

    if (isFailed(status.status)) {
      // Loop-based flows can partially succeed — the overall status is Failed
      // but some iterations produced results (visible in loop-output-N.output
      // and image-generation-N.iterations). Callers that opt in with
      // returnPartialOnFailure get the raw result to salvage what's there;
      // if there's genuinely no payload we still throw.
      if (options?.returnPartialOnFailure && status.result) {
        return {
          sessionId,
          result: status.result,
          failed: true,
          failureError: status.error,
        };
      }
      throw new Error(`Diaflow flow failed: ${status.error || "Unknown error"}`);
    }

    if (status.status === "Done") {
      if (!status.result) {
        throw new Error("Diaflow completed but returned no result");
      }
      return { sessionId, result: status.result };
    }

    await sleep(pollInterval * 1000);
  }

  throw new Error(`Diaflow timed out after ${pollTimeout}s (session: ${sessionId})`);
}

// --- Helpers ---

/**
 * Resolve a Diaflow result path to a full CDN URL.
 */
function toCdnUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) {
    return path;
  }
  return `${DIAFLOW_CDN}/${path.replace(/^\//, "")}`;
}

/**
 * Fetch a remote image and convert to base64.
 */
async function fetchAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch Diaflow image (${res.status}): ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "image/png";
  return { data: buffer.toString("base64"), mimeType: contentType };
}

/**
 * Upload an image to Diaflow via presigned URL.
 * Returns the remote path (key) to reference in payloads.
 *
 * Flow: POST /uploads (get presigned URL + key) → PUT raw bytes to presigned URL → return key
 */
async function uploadImage(imageUrl: string): Promise<string> {
  return uploadAsset(imageUrl, "png", "image/png");
}

/**
 * Generic upload — image, PDF, anything. Shares the presign + PUT flow with
 * uploadImage but parameterizes filename extension + default content type.
 */
async function uploadAsset(
  sourceUrl: string,
  extension: string,
  fallbackContentType: string,
  scope: DiaflowScope = "default",
): Promise<string> {
  const { apiUrl, token } = getConfig(scope);

  let fileBytes: Buffer;
  let contentType = fallbackContentType;

  if (sourceUrl.startsWith("data:")) {
    const [header, b64data] = sourceUrl.split(",");
    contentType = header.match(/data:(.*?);/)?.[1] || fallbackContentType;
    fileBytes = Buffer.from(b64data, "base64");
  } else {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`Failed to download asset for upload (${res.status}): ${sourceUrl}`);
    contentType = res.headers.get("content-type") || fallbackContentType;
    fileBytes = Buffer.from(await res.arrayBuffer());
  }

  const filename = `${crypto.randomUUID()}.${extension}`;
  const presignRes = await fetch(`${apiUrl}/api/v1/flows/uploads`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ folder: "common", name: filename, type: contentType }),
  });

  if (!presignRes.ok) {
    const err = await presignRes.text();
    throw new Error(`Diaflow upload presign failed (${presignRes.status}): ${err}`);
  }

  const presignData = await presignRes.json();
  const uploadUrl = presignData.uploadUrl;
  const remotePath = presignData.key;

  if (!uploadUrl || !remotePath) {
    throw new Error(`Diaflow presign missing uploadUrl or key: ${JSON.stringify(presignData).slice(0, 300)}`);
  }

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: new Uint8Array(fileBytes),
  });

  if (!putRes.ok) {
    throw new Error(`Diaflow asset upload failed (${putRes.status})`);
  }

  return remotePath;
}

// --- One-shot clone flow ---

export type DiaflowCloneOneShotPage = {
  redesignedImageUrl: string;
  /**
   * Source/original page image URL from Diaflow (loop_N_output.url) — the
   * pdf-page render fed into the redesign loop. Undefined on older flows
   * that don't emit `loop_N_output`.
   */
  originalImageUrl?: string;
  analyzeData: unknown;
};

/**
 * Single-call clone pipeline.
 *
 * Input:  R2-resolvable URL of the source PDF.
 * Output: Array of page records, one per PDF page, each containing the
 *         redesigned CDN image URL plus the parsed `llm_0_output` analyze JSON.
 *
 * Diaflow contract:
 *   - Request payload: `{ flow: "text", request: "pdf: <uploadedKey>" }`
 *     (override prefix via env DIAFLOW_CLONE_REQUEST_PREFIX)
 *   - Response output node has a single dynamic string value — a JSON-encoded
 *     array like:
 *       [
 *         {
 *           "image_generation_0_output": "common/.../redesigned.png",
 *           "llm_0_output": "{\"characters\":[...],\"locations\":[...]}"
 *         },
 *         ...
 *       ]
 */
export async function diaflowCloneOneShot(
  pdfUrl: string,
  options?: DiaflowLLMOptions,
): Promise<{ sessionId: string; pages: DiaflowCloneOneShotPage[] }> {
  // The one-shot clone flow lives on a separate Diaflow account / interface
  // and uses its own credentials (DIAFLOW_ONE_SHOT_TOKEN / _API_URL).
  const pdfKey = await uploadAsset(pdfUrl, "pdf", "application/pdf", "one-shot");

  // Real payload shape for the clone flow (verified via Diaflow web client):
  //   POST /api/v1/interfaces/app/process   { "file": ["<uploadKey>"] }
  const payload: DiaflowPayload = { file: [pdfKey] };

  // Salvage partial success: an internal loop iteration failing marks the
  // overall flow as Failed, but loop-output-N.output still lists every
  // successful iteration. Opt into partial-return so we can save those pages
  // instead of tossing the entire session.
  const { sessionId, result, failed, failureError } = await runDiaflowRaw(
    payload,
    "one-shot",
    { returnPartialOnFailure: true },
  );
  logDiaflowToLangfuse("cloneOneShot", pdfKey, undefined, options);

  // The one-shot flow uses a DIFFERENT response schema than the other Diaflow
  // flows: no `result.output` wrapper — the top level is a node-map keyed by
  // `<node-type>-<index>` (e.g. `image-generation-0`, `llm-0`). Each node has
  // its own `.output` field. Parse that shape here.
  console.log(
    `[Diaflow one-shot] session=${sessionId} raw result:`,
    JSON.stringify(result),
  );

  // The canonical multi-page payload lives on `loop-output-N.output` — a
  // proper JSON array of per-iteration objects. Try that FIRST. If absent
  // (older flow / shape change), fall back to the `output` node walker and
  // finally the top-level `image-generation-N` walker (which only surfaces
  // the LAST iteration and therefore returns just 1 page — the very bug
  // that motivated adding the loop-output parser).
  let pages = parseOneShotFromLoopOutputNode(result);
  if (pages.length === 0) pages = parseOneShotFromOutputNode(result);
  if (pages.length === 0) pages = parseOneShotResult(result);
  if (pages.length === 0) {
    if (failed) {
      throw new Error(
        `Diaflow one-shot failed with no salvageable pages (session: ${sessionId}): ${failureError || "Unknown error"}`,
      );
    }
    throw new Error(
      `Diaflow one-shot returned no pages (session: ${sessionId}). ` +
        `Top-level keys: ${Object.keys(result || {}).join(", ")}. ` +
        `See preceding "[Diaflow one-shot]" log line for the full payload.`,
    );
  }
  if (failed) {
    console.warn(
      `[Diaflow one-shot] session=${sessionId} flow failed but salvaged ` +
        `${pages.length} successful page(s). Failure: ${failureError || "Unknown"}`,
    );
  }
  return { sessionId, pages };
}

/**
 * One-shot response walker — `loop-output-N` node variant (PRIMARY).
 *
 * Canonical multi-page shape (verified from real Diaflow response):
 *   {
 *     "loop-output-0": {
 *       "node": "loop-output",
 *       "output": [
 *         { "image_generation_0_output": "https://.../pageN.jpg",
 *           "llm_0_output": "{...}" },
 *         ...
 *       ],
 *       "total_iterations": 6
 *     },
 *     ...
 *   }
 *
 * Each item's key uses the INNER loop node's name (`image_generation_0_output`,
 * `llm_0_output`) — the `_0_` refers to the node id INSIDE the loop, not the
 * page index. Failed iterations show up as `{"error": "...", "iteration": N}`
 * and are skipped.
 */
function parseOneShotFromLoopOutputNode(
  result: Record<string, unknown> | undefined,
): DiaflowCloneOneShotPage[] {
  if (!result || typeof result !== "object") return [];

  for (const [key, node] of Object.entries(result)) {
    if (!/^loop-output(-\d+)?$/i.test(key)) continue;
    if (!node || typeof node !== "object") continue;

    const raw = (node as Record<string, unknown>).output;
    const items = coerceToItemArray(raw);
    if (items.length === 0) continue;

    const pages: DiaflowCloneOneShotPage[] = [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const imgPath = findFirstImagePathInObject(o);
      if (!imgPath) continue; // skip error items like {error, iteration}
      const llmRaw = findFirstLlmOutputInObject(o);
      const originalUrl = findOriginalImageUrlInObject(o);
      pages.push({
        redesignedImageUrl: toCdnUrl(imgPath),
        originalImageUrl: originalUrl ? toCdnUrl(originalUrl) : undefined,
        analyzeData: normalizeLlmOutput(llmRaw),
      });
    }
    if (pages.length > 0) return pages;
  }
  return [];
}

/**
 * One-shot response walker — `output` node variant.
 *
 * Expected shape (canonical one-shot response):
 *   {
 *     "output": {
 *       "id": "output",
 *       "node": "output",
 *       "status": "Successful",
 *       "output": "<JSON string OR object OR array>"
 *     },
 *     ...other nodes ignored (image-generation-N is INPUT to output)
 *   }
 *
 * The `output.output` field is the source of truth: either a JSON-encoded
 * array `[{ image_generation_0_output, llm_0_output }, ...]` (legacy string),
 * a plain object, or an already-parsed array. This walker handles all three
 * so we don't need to know which shape the flow emits today.
 */
function parseOneShotFromOutputNode(
  result: Record<string, unknown> | undefined,
): DiaflowCloneOneShotPage[] {
  if (!result || typeof result !== "object") return [];

  const outputNode = result["output"];
  if (!outputNode || typeof outputNode !== "object") return [];

  const rawOutput = (outputNode as Record<string, unknown>).output;
  const items = coerceToItemArray(rawOutput);
  if (items.length === 0) return [];

  // FAN-OUT DETECTION: when Diaflow's flow has one image-generation node per
  // page, the output can arrive in two shapes:
  //   1. ARRAY, one item per page, each item has its own `image_generation_0_output`.
  //   2. SINGLE OBJECT with `image_generation_0_output`, `image_generation_1_output`,
  //      `image_generation_2_output`, … — all pages collapsed into one object.
  // Shape 2 needs to be split into per-page entries or we drop everything past page 1.
  if (items.length === 1 && items[0] && typeof items[0] === "object") {
    const only = items[0] as Record<string, unknown>;
    const perPage = splitFanoutObject(only);
    if (perPage.length > 1) {
      const pages: DiaflowCloneOneShotPage[] = [];
      for (const p of perPage) {
        if (p.imgPath) {
          pages.push({
            redesignedImageUrl: toCdnUrl(p.imgPath),
            analyzeData: normalizeLlmOutput(p.llmRaw),
          });
        }
      }
      if (pages.length > 0) return pages;
    }
  }

  const pages: DiaflowCloneOneShotPage[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;

    // Per-item key scan: an item can carry `image_generation_0_output`,
    // `image_generation_1_output`, etc. — scan every key rather than only `_0_`.
    let imgPath = findFirstImagePathInObject(o);
    if (!imgPath) imgPath = pickImagePath(o);
    if (!imgPath) continue;

    const llmRaw = findFirstLlmOutputInObject(o);
    const analyzeData = normalizeLlmOutput(llmRaw);

    pages.push({ redesignedImageUrl: toCdnUrl(imgPath), analyzeData });
  }
  return pages;
}

/**
 * Split a fan-out object like
 *   { image_generation_0_output: "...", image_generation_1_output: "...",
 *     llm_0_output: "...",              llm_1_output: "..." }
 * into per-page entries indexed by the `_N_` suffix.
 * Non-fanout keys (image, url, etc.) are ignored here — caller falls back.
 */
function splitFanoutObject(
  o: Record<string, unknown>,
): Array<{ imgPath: string; llmRaw: unknown }> {
  const byIndex = new Map<number, { imgPath?: string; llmRaw?: unknown }>();
  for (const [k, v] of Object.entries(o)) {
    const imgMatch = k.match(/^image[_-]generation[_-](\d+)[_-]output$/i);
    if (imgMatch && typeof v === "string" && v.length > 0) {
      const idx = Number(imgMatch[1]);
      const bucket = byIndex.get(idx) ?? {};
      bucket.imgPath = v;
      byIndex.set(idx, bucket);
      continue;
    }
    const llmMatch = k.match(/^llm[_-](\d+)[_-]output$/i);
    if (llmMatch) {
      const idx = Number(llmMatch[1]);
      const bucket = byIndex.get(idx) ?? {};
      bucket.llmRaw = v;
      byIndex.set(idx, bucket);
    }
  }
  const indices = Array.from(byIndex.keys()).sort((a, b) => a - b);
  return indices.map((i) => {
    const b = byIndex.get(i)!;
    return { imgPath: b.imgPath ?? "", llmRaw: b.llmRaw };
  });
}

function findFirstImagePathInObject(o: Record<string, unknown>): string {
  for (const [k, v] of Object.entries(o)) {
    if (typeof v !== "string" || !v) continue;
    if (/^image[_-]generation[_-]\d+[_-]output$/i.test(k)) return v;
  }
  for (const k of ["image", "image_url", "url", "path"]) {
    const v = o[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return "";
}

function findFirstLlmOutputInObject(o: Record<string, unknown>): unknown {
  for (const [k, v] of Object.entries(o)) {
    if (/^llm[_-]\d+[_-]output$/i.test(k)) return v;
  }
  return o["analyze"] ?? o["llm"] ?? o["analysis"] ?? null;
}

/**
 * Extract the source page image URL from a loop-output item.
 *
 * Shape from Diaflow: `loop_N_output` is a JSON-encoded object `{"url": "..."}`
 * carrying the pre-redesign PDF page. Older flows omit this field entirely.
 */
function findOriginalImageUrlInObject(o: Record<string, unknown>): string {
  for (const [k, v] of Object.entries(o)) {
    if (!/^loop[_-]\d+[_-]output$/i.test(k)) continue;
    if (typeof v === "string") {
      try {
        const parsed = JSON.parse(v);
        if (parsed && typeof parsed === "object" && typeof (parsed as Record<string, unknown>).url === "string") {
          return (parsed as Record<string, unknown>).url as string;
        }
      } catch {
        // If the value is already a plain URL string, take it as-is.
        if (v.startsWith("http")) return v;
      }
    } else if (v && typeof v === "object") {
      const url = (v as Record<string, unknown>).url;
      if (typeof url === "string" && url.length > 0) return url;
    }
  }
  return "";
}

/** Coerce output-node payload into a list of per-page records. */
function coerceToItemArray(raw: unknown): unknown[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  }
  if (typeof raw === "object") return [raw];
  return [];
}

/**
 * Debug/recheck helper — polls an existing Diaflow one-shot session ONCE and
 * runs the same parser used by the live flow. No new Diaflow API call is made
 * beyond the status poll. Useful when the live parse threw but the session
 * itself may have valid data.
 */
export async function diaflowRecheckOneShotSession(
  sessionId: string,
): Promise<{
  sessionId: string;
  status: string;
  raw: Record<string, unknown> | undefined;
  pages: DiaflowCloneOneShotPage[];
  parseError?: string;
}> {
  const { apiUrl, token } = getConfig("one-shot");
  const status = await pollOnce(sessionId, token, apiUrl);
  const raw = status.result;
  console.log(
    `[Diaflow recheck] session=${sessionId} status=${status.status} raw:`,
    JSON.stringify(raw),
  );
  try {
    // Mirror the live parser chain (loop-output-N → output → image-generation-N)
    // so the recheck endpoint returns the same page count as the worker would.
    let pages = raw ? parseOneShotFromLoopOutputNode(raw) : [];
    if (pages.length === 0 && raw) pages = parseOneShotFromOutputNode(raw);
    if (pages.length === 0 && raw) pages = parseOneShotResult(raw);
    return { sessionId, status: status.status, raw, pages };
  } catch (err) {
    return {
      sessionId,
      status: status.status,
      raw,
      pages: [],
      parseError: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * One-shot response walker. Expected shape (verified via runtime logs):
 *   {
 *     "image-generation-0": { id, node, status, output: "<path or url>" | { ... } | [...] },
 *     "image-generation-1": { ..., output: ... },
 *     "llm-0":              { ..., output: "{...}" or {...} },
 *     ...
 *   }
 *
 * Multi-page PDFs produce one image-generation-N node per page. LLM nodes are
 * paired with their corresponding image-generation index; when absent we still
 * emit the page (analyzeData = null).
 */
function parseOneShotResult(
  result: Record<string, unknown> | undefined,
): DiaflowCloneOneShotPage[] {
  if (!result || typeof result !== "object") return [];

  // Group nodes by suffix index: "image-generation-0" → 0, "llm-0" → 0
  type NodeBucket = { image?: unknown; llm?: unknown };
  const byIndex = new Map<number, NodeBucket>();
  for (const [key, node] of Object.entries(result)) {
    const m = key.match(/^(image-generation|llm)-(\d+)$/);
    if (!m) continue;
    const kind = m[1] as "image-generation" | "llm";
    const idx = Number(m[2]);
    const bucket = byIndex.get(idx) ?? {};
    if (kind === "image-generation") bucket.image = node;
    else bucket.llm = node;
    byIndex.set(idx, bucket);
  }

  const indices = Array.from(byIndex.keys()).sort((a, b) => a - b);
  const pages: DiaflowCloneOneShotPage[] = [];
  for (const idx of indices) {
    const { image, llm } = byIndex.get(idx)!;
    const imgOut = extractNodeOutput(image);
    const imgPath = pickImagePath(imgOut);
    if (!imgPath) continue; // skip failed / non-image entries

    const llmOut = extractNodeOutput(llm);
    const analyzeData = normalizeLlmOutput(llmOut);

    pages.push({
      redesignedImageUrl: toCdnUrl(imgPath),
      analyzeData,
    });
  }
  return pages;
}

function extractNodeOutput(node: unknown): unknown {
  if (!node || typeof node !== "object") return undefined;
  return (node as Record<string, unknown>).output;
}

/** image output may be: string path, { url|path|image }, or array — flatten to first string. */
function pickImagePath(output: unknown): string {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const s = pickImagePath(item);
      if (s) return s;
    }
    return "";
  }
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    for (const k of ["url", "path", "image", "image_url", "output"]) {
      const v = o[k];
      if (typeof v === "string" && v.length > 0) return v;
    }
  }
  return "";
}

function normalizeLlmOutput(output: unknown): unknown {
  if (output == null) return null;
  if (typeof output === "string") {
    try {
      return JSON.parse(output);
    } catch {
      return output;
    }
  }
  return output;
}

// --- Langfuse ---

function logDiaflowToLangfuse(
  operation: string,
  prompt: string,
  usage: ImageUsage | undefined,
  options?: ImageGenerationOptions,
) {
  const lf = getLangfuse();
  if (!lf) return;
  const trace = lf.trace({
    name: options?.trace?.caller || `diaflow/${operation}`,
    metadata: {
      entityType: options?.trace?.entityType,
      entityId: options?.trace?.entityId,
    },
  });
  trace.generation({
    name: operation,
    model: "diaflow",
    input: prompt,
    usage: usage
      ? {
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
        }
      : undefined,
  });
}

// --- Image Provider ---

export const diaflowImageProvider: ImageProviderInterface = {
  async generateImage(
    prompt: string,
    options: ImageGenerationOptions = {},
  ): Promise<GeneratedImage> {
    const { extracted } = await runDiaflow({ flow: "image", request: prompt });

    if (!extracted.image) {
      throw new Error("Diaflow returned no image in result");
    }

    const imageUrl = toCdnUrl(extracted.image);
    const { data, mimeType } = await fetchAsBase64(imageUrl);

    const image: GeneratedImage = {
      base64: data,
      dataUrl: `data:${mimeType};base64,${data}`,
    };

    logDiaflowToLangfuse("generateImage", prompt, image.usage, options);
    return image;
  },

  async editImage(
    imageUrl: string,
    prompt: string,
    options: ColorizeOptions & { imageLabel?: string } = {},
  ): Promise<GeneratedImage> {
    const { referenceImageUrls, imageLabel } = options;

    // Upload images, then embed remote paths in the request string
    const parts: string[] = [];
    const characterPath = await uploadImage(imageUrl);
    parts.push(`${imageLabel || "source image"}: ${characterPath}`);
    if (referenceImageUrls?.length) {
      for (const refUrl of referenceImageUrls) {
        const refPath = await uploadImage(refUrl);
        parts.push(`reference image: ${refPath}`);
      }
    }
    parts.push(prompt);

    const { extracted } = await runDiaflow({ flow: "image", request: parts.join("\n") });

    if (!extracted.image) {
      throw new Error("Diaflow returned no image in result");
    }

    const cdnUrl = toCdnUrl(extracted.image);
    const { data, mimeType } = await fetchAsBase64(cdnUrl);

    const image: GeneratedImage = {
      base64: data,
      dataUrl: `data:${mimeType};base64,${data}`,
    };

    logDiaflowToLangfuse("editImage", prompt, image.usage, options);
    return image;
  },
};

// --- LLM Functions ---

type DiaflowLLMOptions = {
  trace?: { caller?: string; entityType?: string; entityId?: string };
};

export async function diaflowTextPrompt(
  prompt: string,
  options?: DiaflowLLMOptions & { systemPrompt?: string },
): Promise<string> {
  const fullPrompt = options?.systemPrompt ? `${options.systemPrompt}\n\n${prompt}` : prompt;

  const { extracted } = await runDiaflow({ flow: "text", request: fullPrompt });

  if (!extracted.content) {
    throw new Error("Diaflow returned no content in result");
  }

  logDiaflowToLangfuse("textPrompt", prompt, undefined, options);
  return extracted.content;
}

async function visionAnalyzeInternal(
  imageUrl: string | string[],
  prompt: string,
  options?: DiaflowLLMOptions & { systemPrompt?: string },
): Promise<{ content: string; sessionId: string }> {
  const basePrompt = options?.systemPrompt ? `${options.systemPrompt}\n\n${prompt}` : prompt;

  // Upload image(s), embed remote paths in request string
  const urls = Array.isArray(imageUrl) ? imageUrl : [imageUrl];
  const imageParts: string[] = [];
  for (const url of urls) {
    const imagePath = await uploadImage(url);
    imageParts.push(`image: ${imagePath}`);
  }
  const request = `${imageParts.join("\n")}\n${basePrompt}`;
  const { sessionId, extracted } = await runDiaflow({ flow: "text", request });

  if (!extracted.content) {
    throw new Error(`Diaflow returned no content in result (session: ${sessionId})`);
  }

  return { content: extracted.content, sessionId };
}

export async function diaflowVisionAnalyze(
  imageUrl: string | string[],
  prompt: string,
  options?: DiaflowLLMOptions & { systemPrompt?: string },
): Promise<string> {
  const { content } = await visionAnalyzeInternal(imageUrl, prompt, options);
  logDiaflowToLangfuse("visionAnalyze", prompt, undefined, options);
  return content;
}

/**
 * Repair JSON that was truncated mid-stream (Diaflow caps long responses).
 *
 * Strategy: single-pass scan to find the last position where the prefix is a
 * complete sequence of values, then close the still-open `{`/`[` containers.
 * Mid-string and mid-key truncations are discarded back to the previous comma
 * or container close.
 */
function repairTruncatedJson(input: string): string {
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  // Position such that input.slice(0, lastSafe) is a closeable prefix
  // (every value before it is complete; bracket stack is unambiguous).
  let lastSafe = 0;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === "\\") { escape = true; continue; }
      if (ch === "\"") { inString = false; }
      continue;
    }

    if (ch === "\"") { inString = true; continue; }
    if (ch === "{" || ch === "[") { stack.push(ch); continue; }
    if (ch === "}" || ch === "]") { stack.pop(); lastSafe = i + 1; continue; }
    if (ch === "," && stack.length > 0) {
      // A value just completed before this comma. Cutting here and closing
      // open containers produces valid JSON minus the (incomplete) next value.
      lastSafe = i;
    }
  }

  if (!inString && stack.length === 0) return input;

  let repaired = input.slice(0, lastSafe).replace(/[\s,]+$/, "");

  // Recompute the bracket stack on the truncated prefix and close it.
  const finalStack: string[] = [];
  let inS = false;
  let esc = false;
  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (esc) { esc = false; continue; }
    if (inS) {
      if (ch === "\\") esc = true;
      else if (ch === "\"") inS = false;
      continue;
    }
    if (ch === "\"") inS = true;
    else if (ch === "{" || ch === "[") finalStack.push(ch);
    else if (ch === "}" || ch === "]") finalStack.pop();
  }
  for (let i = finalStack.length - 1; i >= 0; i--) {
    repaired += finalStack[i] === "{" ? "}" : "]";
  }
  return repaired;
}

/**
 * Parse a Diaflow text response as JSON, with one repair attempt and one
 * full retry of the Diaflow call.
 *
 * Per-attempt sequence:
 *   1. Strip markdown code fences.
 *   2. Try `JSON.parse(cleaned)`. Return on success.
 *   3. Try `JSON.parse(repairTruncatedJson(cleaned))` — closes unterminated
 *      strings/brackets (covers the "AI missed a closing char" case).
 *   4. If both fail, re-call Diaflow once more (attempt 2).
 *
 * Only after both attempts have failed do we throw with full trace info.
 */
const MAX_PARSE_ATTEMPTS = 2;

export async function diaflowVisionAnalyzeJSON<T = unknown>(
  imageUrl: string | string[],
  prompt: string,
  options?: DiaflowLLMOptions & { systemPrompt?: string },
): Promise<T> {
  let lastFailure: { sessionId: string; raw: string; parseError: string } | null = null;

  for (let attempt = 1; attempt <= MAX_PARSE_ATTEMPTS; attempt++) {
    const { content: raw, sessionId } = await visionAnalyzeInternal(imageUrl, prompt, options);
    logDiaflowToLangfuse("visionAnalyzeJSON", prompt, undefined, options);

    let cleaned = raw.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }

    // (a) Direct parse
    try {
      return JSON.parse(cleaned) as T;
    } catch (err) {
      lastFailure = {
        sessionId,
        raw,
        parseError: err instanceof Error ? err.message : String(err),
      };
    }

    // (b) Repair (close unterminated string + missing `}` / `]`) and reparse
    const repaired = repairTruncatedJson(cleaned);
    if (repaired !== cleaned) {
      try {
        const parsed = JSON.parse(repaired) as T;
        console.warn("[Diaflow] Response auto-repaired (closed truncation)", {
          sessionId,
          attempt,
          rawLength: raw.length,
          repairedLength: repaired.length,
          droppedChars: raw.length - repaired.length,
        });
        return parsed;
      } catch {
        /* fall through to retry / final throw */
      }
    }

    if (attempt < MAX_PARSE_ATTEMPTS) {
      console.warn("[Diaflow] Parse + repair failed, retrying Diaflow call once", {
        sessionId,
        attempt,
        rawLength: raw.length,
        parseError: lastFailure.parseError,
      });
    }
  }

  // Both attempts exhausted
  const { sessionId, raw, parseError } = lastFailure!;
  console.error("[Diaflow] Invalid JSON after retry", {
    sessionId,
    parseError,
    rawLength: raw.length,
    prompt: prompt.slice(0, 300),
    rawContent: raw,
  });
  throw new Error(
    `Diaflow returned invalid JSON after ${MAX_PARSE_ATTEMPTS} attempts. ` +
    `Last session: ${sessionId} | Raw length: ${raw.length} chars | ` +
    `Parse error: ${parseError}\n` +
    `Raw content (first 500 chars): ${raw.slice(0, 500)}`,
  );
}
