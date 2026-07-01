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

import type {
  ImageProviderInterface,
  ImageGenerationOptions,
  GeneratedImage,
  ColorizeOptions,
  ImageUsage,
} from "./image-provider-types";
import { getLangfuse } from "../langfuse";
import { awaitDiaflowSlot } from "./diaflow-rate-limiter";

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

const DIAFLOW_CDN = "https://cdn.diaflow.io";
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
): Promise<{ sessionId: string; result: Record<string, unknown> }> {
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
): Promise<DiaflowCloneOneShotPage[]> {
  // The one-shot clone flow lives on a separate Diaflow account / interface
  // and uses its own credentials (DIAFLOW_ONE_SHOT_TOKEN / _API_URL).
  const pdfKey = await uploadAsset(pdfUrl, "pdf", "application/pdf", "one-shot");

  // Real payload shape for the clone flow (verified via Diaflow web client):
  //   POST /api/v1/interfaces/app/process   { "file": ["<uploadKey>"] }
  const payload: DiaflowPayload = { file: [pdfKey] };

  const { sessionId, result } = await runDiaflowRaw(payload, "one-shot");
  logDiaflowToLangfuse("cloneOneShot", pdfKey, undefined, options);

  const arrayString = pickFirstOutputString(result);
  if (!arrayString) {
    throw new Error(
      `Diaflow one-shot returned no string output (session: ${sessionId}): ${JSON.stringify(result).slice(0, 300)}`,
    );
  }

  let arr: Array<Record<string, unknown>>;
  try {
    const parsed = JSON.parse(arrayString);
    arr = Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    throw new Error(
      `Diaflow one-shot output is not valid JSON (session: ${sessionId}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return arr.map((item, idx) => {
    const imgPath = typeof item.image_generation_0_output === "string"
      ? item.image_generation_0_output
      : "";
    const llmRaw = typeof item.llm_0_output === "string" ? item.llm_0_output : "";
    if (!imgPath) {
      throw new Error(`Diaflow one-shot item ${idx} missing image_generation_0_output (session: ${sessionId})`);
    }
    let analyzeData: unknown = null;
    if (llmRaw) {
      try {
        analyzeData = JSON.parse(llmRaw);
      } catch {
        analyzeData = llmRaw;
      }
    }
    return {
      redesignedImageUrl: toCdnUrl(imgPath),
      analyzeData,
    };
  });
}

/**
 * Pull the first string value out of Diaflow's `output` node. The wrapping
 * field id is dynamic so we either follow input_cf when present or scan
 * top-level for the first non-meta string.
 */
function pickFirstOutputString(result: Record<string, unknown> | undefined): string | null {
  if (!result) return null;
  const out = result["output"] as Record<string, unknown> | undefined;
  if (!out) return null;
  const cf = out["input_cf"] as Record<string, { output_type?: string }> | undefined;
  if (cf) {
    for (const [fieldId, schema] of Object.entries(cf)) {
      if (schema.output_type === "text") {
        const v = out[fieldId];
        if (typeof v === "string" && v.length > 0) return v;
      }
    }
  }
  for (const [k, v] of Object.entries(out)) {
    if (k === "input_cf" || k === "input") continue;
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
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
