/**
 * Gemini-Web Image Provider — image generation + editing via an
 * OpenAI-Chat-Completions-compatible endpoint that drives a signed-in Gemini
 * web session behind the scenes (browser automation). Select with
 * IMAGE_PROVIDER=gemini-web, or add "gemini-web" to IMAGE_FALLBACK_PROVIDERS.
 *
 * Contract (same model does BOTH generate and edit):
 *   POST {base}/v1/chat/completions
 *   - generate: messages=[{role:"user", content:"<prompt>"}]
 *   - edit:     messages=[{role:"user", content:[
 *                 {type:"text", text:"<prompt>"},
 *                 {type:"image_url", image_url:{url:"data:...|http(s)"}}]}]
 *   Response: the image URL is embedded as MARKDOWN in choices[0].message.content:
 *     "*Generated 1 image(s). ![generated image](https://.../assets/oracle/<uuid>.png)*"
 *   The URL is publicly fetchable (GET, no auth), watermark already removed.
 *
 * Config (env; defaults to the shared LiteLLM host since it's the same proxy):
 *   GEMINI_WEB_BASE_URL   default: LITELLM_BASE_URL
 *   GEMINI_WEB_API_KEY    default: LITELLM_API_KEY
 *   GEMINI_WEB_MODEL      default: "gemini-web-image"
 *
 * Operational caveats handled here:
 *   - Latency 30–90s/image → we reuse litellmFetch (its undici Agent already
 *     runs a 900s timeout) so slow browser runs don't abort.
 *   - No image URL in content = soft quota/rate-limit failure → we throw so the
 *     provider-fallback chain routes to the next backend.
 *   - The result URL lives on the same self-signed-cert host → fetch it through
 *     litellmFetch too (plain fetch would fail TLS verification).
 *   - Serial backend: callers here (clone reproduce/fill-interior) are already
 *     sequential; overlapping requests only queue on the backend.
 */

import { getLangfuse } from "../langfuse";
import { litellmFetch } from "./litellm-dispatcher";
import type {
  ColorizeOptions,
  GeneratedImage,
  ImageGenerationOptions,
  ImageProviderInterface,
} from "./image-provider-types";

/** Matches the markdown image URL the endpoint returns (any host, /assets/oracle/…). */
const IMAGE_URL_RE = /https?:\/\/[^\s)]+\/assets\/oracle\/[\w-]+\.(?:png|jpe?g|webp|gif)/i;

function getConfig() {
  const baseUrl = (process.env.GEMINI_WEB_BASE_URL || process.env.LITELLM_BASE_URL)?.replace(/\/$/, "");
  const apiKey = process.env.GEMINI_WEB_API_KEY || process.env.LITELLM_API_KEY;
  const model = process.env.GEMINI_WEB_MODEL || "gemini-web-image";
  if (!baseUrl || !apiKey) {
    throw new Error(
      "gemini-web image provider not configured. Set GEMINI_WEB_BASE_URL + GEMINI_WEB_API_KEY (or LITELLM_BASE_URL + LITELLM_API_KEY).",
    );
  }
  return { baseUrl, apiKey, model };
}

/** Download a source (http(s)) into a base64 data-URI; data: URLs pass through. */
async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`gemini-web: failed to download source image (${res.status}): ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type") || "image/png";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

/** Fetch the returned image URL (same self-signed host) → base64. */
async function fetchResultAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await litellmFetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`gemini-web: failed to fetch result image (${res.status}): ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get("content-type") || "image/png";
  return { data: buffer.toString("base64"), mimeType };
}

type ChatContent = string | Array<Record<string, unknown>>;

async function callChat(content: ChatContent): Promise<string> {
  const { baseUrl, apiKey, model } = getConfig();
  const res = await litellmFetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content }] }),
  });
  if (!res.ok) {
    // 502 browser_session_failed, 504 timeout, 401/400/404 OpenAI-shaped errors.
    const body = await res.text();
    throw new Error(`gemini-web error (${res.status}): ${body.slice(0, 400)}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = json.choices?.[0]?.message?.content ?? "";
  const match = IMAGE_URL_RE.exec(text);
  if (!match) {
    // No URL => quota / rate-limit ("…Instant image-generation limit reached…")
    // or an unexpected message. Throw so the fallback chain routes onward.
    throw new Error(`gemini-web: no image URL in response (quota/rate-limit?): ${text.slice(0, 200)}`);
  }
  return match[0];
}

function logToLangfuse(operation: string, prompt: string, options?: ImageGenerationOptions): void {
  const lf = getLangfuse();
  if (!lf) return;
  const trace = lf.trace({
    name: options?.trace?.caller || `gemini-web/${operation}`,
    metadata: { entityType: options?.trace?.entityType, entityId: options?.trace?.entityId },
  });
  trace.generation({ name: operation, model: getConfig().model, input: prompt });
}

export const geminiWebImageProvider: ImageProviderInterface = {
  async generateImage(prompt: string, options: ImageGenerationOptions = {}): Promise<GeneratedImage> {
    const url = await callChat(prompt);
    const { data, mimeType } = await fetchResultAsBase64(url);
    logToLangfuse("generateImage", prompt, options);
    return { base64: data, dataUrl: `data:${mimeType};base64,${data}` };
  },

  async editImage(imageUrl: string, prompt: string, options: ColorizeOptions = {}): Promise<GeneratedImage> {
    const dataUrl = await toDataUrl(imageUrl);
    const url = await callChat([
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: dataUrl } },
    ]);
    const { data, mimeType } = await fetchResultAsBase64(url);
    logToLangfuse("editImage", prompt, options);
    return { base64: data, dataUrl: `data:${mimeType};base64,${data}` };
  },
};
