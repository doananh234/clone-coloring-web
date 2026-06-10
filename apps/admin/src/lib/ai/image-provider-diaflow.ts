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

// --- Types ---

type DiaflowPayload = {
  flow: "image" | "text";
  request: string;
};

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

function getConfig() {
  const apiUrl = (process.env.DIAFLOW_API_URL || "https://api.diaflow.io").replace(/\/$/, "");
  const token = process.env.DIAFLOW_TOKEN;
  const pollInterval = Number(process.env.DIAFLOW_POLL_INTERVAL) || 3;
  const pollTimeout = Number(process.env.DIAFLOW_POLL_TIMEOUT) || 300;

  if (!token) {
    throw new Error("Diaflow not configured. Set DIAFLOW_TOKEN in .env.local");
  }

  return { apiUrl, token, pollInterval, pollTimeout };
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
      await sleep(3000);
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
  const { apiUrl, token, pollInterval, pollTimeout } = getConfig();

  const sessionId = await createSession(payload, token, apiUrl);
  const deadline = Date.now() + pollTimeout * 1000;

  while (Date.now() < deadline) {
    await sleep(pollInterval * 1000);
    const status = await pollOnce(sessionId, token, apiUrl);

    if (isFailed(status.status)) {
      throw new Error(`Diaflow flow failed: ${status.error || "Unknown error"}`);
    }

    if (status.status === "Done") {
      if (!status.result) {
        throw new Error("Diaflow completed but returned no result");
      }
      return { sessionId, extracted: extractFromOutput(status.result) };
    }
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
  const { apiUrl, token } = getConfig();

  // Fetch image bytes
  let imageBytes: Buffer;
  let contentType = "image/png";

  if (imageUrl.startsWith("data:")) {
    const [header, b64data] = imageUrl.split(",");
    contentType = header.match(/data:(.*?);/)?.[1] || "image/png";
    imageBytes = Buffer.from(b64data, "base64");
  } else {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Failed to download image for upload (${res.status}): ${imageUrl}`);
    contentType = res.headers.get("content-type") || "image/png";
    imageBytes = Buffer.from(await res.arrayBuffer());
  }

  // Step 1: Get presigned upload URL
  const filename = `${crypto.randomUUID()}.png`;
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

  // Step 2: PUT raw bytes to presigned URL
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: new Uint8Array(imageBytes),
  });

  if (!putRes.ok) {
    throw new Error(`Diaflow image upload failed (${putRes.status})`);
  }

  return remotePath;
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

export async function diaflowVisionAnalyze(
  imageUrl: string | string[],
  prompt: string,
  options?: DiaflowLLMOptions & { systemPrompt?: string },
): Promise<string> {
  const basePrompt = options?.systemPrompt ? `${options.systemPrompt}\n\n${prompt}` : prompt;

  // Upload image(s), embed remote paths in request string
  const urls = Array.isArray(imageUrl) ? imageUrl : [imageUrl];
  const imageParts: string[] = [];
  for (const url of urls) {
    const imagePath = await uploadImage(url);
    imageParts.push(`image: ${imagePath}`);
  }
  const request = `${imageParts.join("\n")}\n${basePrompt}`;
  const { extracted } = await runDiaflow({ flow: "text", request });

  if (!extracted.content) {
    throw new Error("Diaflow returned no content in result");
  }

  logDiaflowToLangfuse("visionAnalyze", prompt, undefined, options);
  return extracted.content;
}

export async function diaflowVisionAnalyzeJSON<T = unknown>(
  imageUrl: string | string[],
  prompt: string,
  options?: DiaflowLLMOptions & { systemPrompt?: string },
): Promise<T> {
  const raw = await diaflowVisionAnalyze(imageUrl, prompt, options);

  // Strip markdown code fences the LLM may wrap around JSON
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    // Attempt to repair truncated JSON (missing closing braces/brackets)
    let repaired = cleaned;
    const opens = (repaired.match(/[{[]/g) || []).length;
    const closes = (repaired.match(/[}\]]/g) || []).length;
    if (opens > closes) {
      // Remove trailing partial key/value (e.g. truncated mid-string)
      repaired = repaired.replace(/,?\s*"[^"]*"?\s*:?\s*"?[^"{}[\]]*$/, "");
      for (let i = 0; i < opens - closes; i++) {
        const lastOpen = repaired.lastIndexOf("{") > repaired.lastIndexOf("[") ? "}" : "]";
        repaired += lastOpen;
      }
    }
    try {
      return JSON.parse(repaired) as T;
    } catch {
      throw new Error(
        `Diaflow returned invalid JSON (possibly truncated). ` +
        `Parse error: ${err instanceof Error ? err.message : err}\n` +
        `Raw content (first 500 chars): ${raw.slice(0, 500)}`
      );
    }
  }
}
