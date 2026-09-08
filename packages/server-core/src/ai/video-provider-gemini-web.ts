/**
 * Gemini-Video Provider — text→video and image→video via an
 * OpenAI-Chat-Completions-compatible endpoint that drives a signed-in Gemini
 * web session running Veo behind the scenes (browser automation).
 *
 * Contract (ONE model does BOTH modes; POST {base}/v1/chat/completions):
 *   - text→video:  messages=[{role:"user", content:"<prompt>"}]
 *   - image→video: messages=[{role:"user", content:[
 *                    {type:"text", text:"<motion prompt>"},
 *                    {type:"image_url", image_url:{url:"data:...|http(s)"}}]}]
 *   Response: the video URL is a MARKDOWN LINK (note: [..](..), NOT an image ![..]):
 *     "Generated 1 video. [generated video](https://.../assets/oracle/<uuid>.mp4)"
 *   The URL is publicly fetchable (GET, no auth), Content-Type video/mp4,
 *   watermark already removed.
 *
 * Config (env; defaults to the shared LiteLLM host — same proxy/host as images):
 *   GEMINI_VIDEO_BASE_URL  default: LITELLM_BASE_URL
 *   GEMINI_VIDEO_API_KEY   default: LITELLM_API_KEY
 *   GEMINI_VIDEO_MODEL     default: "gemini-video"
 *
 * Operational caveats handled here (video is heavier than image):
 *   - VERY slow: ~3–8 min/video (Veo render + per-frame watermark removal). We
 *     reuse litellmFetch whose undici Agent already runs a 900s timeout so slow
 *     renders don't abort. The server deadline is ~600s (returns 504 beyond).
 *   - SERIAL backend: one video at a time — callers MUST run these in a
 *     background job (worker), never on a request thread, and never in bursts.
 *   - image→video is BEST-EFFORT: the browser image-attach step can fail (502);
 *     we retry ONCE, then bubble up so the caller can fall back / alert.
 *   - No URL in content = Veo quota/rate-limit → throw so the caller can defer.
 *   - Result URL lives on the same self-signed host → download via litellmFetch.
 */

import { litellmFetch } from "./litellm-dispatcher";

/** Markdown-link video URL the endpoint returns (any host, /assets/oracle/…). */
const VIDEO_URL_RE = /https?:\/\/[^\s)\]]+\/assets\/oracle\/[\w-]+\.(?:mp4|webm|mov)/i;

function getConfig() {
  const baseUrl = (process.env.GEMINI_VIDEO_BASE_URL || process.env.LITELLM_BASE_URL)?.replace(/\/$/, "");
  const apiKey = process.env.GEMINI_VIDEO_API_KEY || process.env.LITELLM_API_KEY;
  const model = process.env.GEMINI_VIDEO_MODEL || "gemini-video";
  if (!baseUrl || !apiKey) {
    throw new Error(
      "gemini-video provider not configured. Set GEMINI_VIDEO_BASE_URL + GEMINI_VIDEO_API_KEY (or LITELLM_BASE_URL + LITELLM_API_KEY).",
    );
  }
  return { baseUrl, apiKey, model };
}

/** Download a source (http(s)) into a base64 data-URI; data: URLs pass through. */
async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`gemini-video: failed to download source image (${res.status}): ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type") || "image/png";
  return `data:${mime};base64,${buffer.toString("base64")}`;
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
    // 502 browser_session/attach failed, 504 render timeout, 401/400/404 OpenAI-shaped.
    const body = await res.text();
    const err = new Error(`gemini-video error (${res.status}): ${body.slice(0, 400)}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = json.choices?.[0]?.message?.content ?? "";
  const match = VIDEO_URL_RE.exec(text);
  if (!match) {
    // No URL => Veo quota/rate-limit ("…limit reached…") or an unexpected message.
    throw new Error(`gemini-video: no video URL in response (quota/rate-limit?): ${text.slice(0, 200)}`);
  }
  return match[0];
}

/** Text → video. Returns the public source video URL (on the self-signed host). */
export async function generateVideo(prompt: string): Promise<string> {
  return callChat(prompt);
}

/**
 * Image → video (animate a still). imageUrl may be an http(s) URL or data-URI.
 * Retries ONCE on a 502 (the browser image-attach step is fragile), then throws.
 */
export async function videoFromImage(imageUrl: string, prompt: string): Promise<string> {
  const dataUrl = await toDataUrl(imageUrl);
  const content: ChatContent = [
    { type: "text", text: prompt },
    { type: "image_url", image_url: { url: dataUrl } },
  ];
  try {
    return await callChat(content);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 502) {
      // One retry for the flaky attach step before giving up.
      return callChat(content);
    }
    throw err;
  }
}

/** Fetch the returned video URL (same self-signed host) → Buffer for re-upload. */
export async function downloadVideo(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const res = await litellmFetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`gemini-video: failed to fetch result video (${res.status}): ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get("content-type") || "video/mp4";
  return { buffer, mimeType };
}
