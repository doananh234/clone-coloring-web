/**
 * LiteLLM Image Provider — image generation/editing via a LiteLLM proxy.
 * Implements ImageProviderInterface.
 *
 * Config:
 *   LITELLM_BASE_URL   e.g. xxx
 *   LITELLM_API_KEY    proxy key (sk-...)
 *   LITELLM_IMAGE_MODEL default: gemini-3.1-flash-image
 *
 * LiteLLM is OpenAI-compatible. Gemini image models return the generated image
 * on the chat-completion response at `choices[0].message.images[0].image_url.url`
 * as a base64 data URL (NOT via /v1/images/generations, which 404s for these
 * models on the current proxy). Both text-to-image (generateImage) and
 * image-to-image (editImage, via multimodal image_url parts) use the same
 * `/v1/chat/completions` endpoint.
 */

import { Blob } from "node:buffer";
import { FormData } from "undici";
import { getLangfuse } from "../langfuse";
import { litellmFetch } from "./litellm-dispatcher";
import type {
  ColorizeOptions,
  GeneratedImage,
  ImageGenerationOptions,
  ImageProviderInterface,
  ImageUsage,
} from "./image-provider-types";

/** Gemini rejects more than a couple of reference images; mirror the gemini provider cap. */
const MAX_REFERENCE_IMAGES = 2;

function getConfig() {
  const baseUrl = process.env.LITELLM_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.LITELLM_API_KEY;
  const model = process.env.LITELLM_IMAGE_MODEL || "gemini-3.1-flash-image";

  if (!baseUrl || !apiKey) {
    throw new Error(
      "LiteLLM image provider not configured. Set LITELLM_BASE_URL and LITELLM_API_KEY.",
    );
  }

  return { baseUrl, apiKey, model };
}

type ChatMessagePart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/**
 * Inline a source/reference image as a base64 data URL. Gemini (behind LiteLLM)
 * is picky about remote URLs, so we download and embed like the gemini provider.
 * Data URLs are passed straight through.
 */
async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`LiteLLM: failed to download image (${res.status}): ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type") || "image/png";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function parseImageResponse(result: Record<string, unknown>): GeneratedImage {
  const choices = result.choices as
    | Array<{ message?: { images?: Array<{ image_url?: { url?: string } }>; content?: unknown } }>
    | undefined;
  const dataUrl = choices?.[0]?.message?.images?.[0]?.image_url?.url;

  if (!dataUrl || !dataUrl.startsWith("data:")) {
    const preview = JSON.stringify(result).slice(0, 500);
    throw new Error(`No image data in LiteLLM response: ${preview}`);
  }

  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);

  const rawUsage = result.usage as
    | { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    | undefined;
  const usage: ImageUsage | undefined = rawUsage
    ? {
        promptTokens: rawUsage.prompt_tokens,
        completionTokens: rawUsage.completion_tokens,
        totalTokens: rawUsage.total_tokens,
      }
    : undefined;

  return { base64, dataUrl, usage };
}

/**
 * Build the Gemini generationConfig for an aspect-ratio hint. The proxy forwards
 * `generationConfig.imageConfig.aspectRatio` to the Gemini image model (verified:
 * accepted with HTTP 200). Omitted when no ratio is requested.
 */
function aspectRatioBody(options?: ImageGenerationOptions): Record<string, unknown> | undefined {
  if (!options?.aspectRatio) return undefined;
  return { generationConfig: { imageConfig: { aspectRatio: options.aspectRatio } } };
}

async function callChat(
  parts: ChatMessagePart[],
  extraBody?: Record<string, unknown>,
  modelOverride?: string,
): Promise<{ result: Record<string, unknown>; model: string }> {
  const { baseUrl, apiKey, model: defaultModel } = getConfig();
  const model = modelOverride?.trim() || defaultModel;

  const res = await litellmFetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: parts }],
      ...(extraBody ?? {}),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LiteLLM image error (${res.status}): ${err.slice(0, 500)}`);
  }

  return { result: await res.json(), model };
}

function logToLangfuse(
  operation: string,
  model: string,
  prompt: string,
  usage: ImageUsage | undefined,
  options?: ImageGenerationOptions,
) {
  const lf = getLangfuse();
  if (!lf) return;
  const trace = lf.trace({
    name: options?.trace?.caller || `litellm/${operation}`,
    metadata: {
      entityType: options?.trace?.entityType,
      entityId: options?.trace?.entityId,
    },
  });
  trace.generation({
    name: operation,
    model,
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

// --- OpenAI images API path (gpt-image-2, DALL·E, Qwen-Image 2.1) ----------
//
// Azure gpt-image-2 (and DALL·E) are image-GENERATION models: they only answer
// on /v1/images/generations and /v1/images/edits, NOT /v1/chat/completions
// (Azure returns "operation unsupported" for chat on these). Gemini image
// models are the opposite — chat-only. So we branch by model.
//
// qwen-image-2.1 (local Qwen-Image 2.1 on ComfyUI, behind the same proxy) is
// also images-API-only, so it joins this branch.

/**
 * Models that must use the OpenAI images API instead of chat-completions.
 * Override with LITELLM_IMAGE_API_MODELS (csv, substring match); defaults to
 * gpt-image / dall-e / qwen-image name patterns.
 */
function usesImagesApi(model: string): boolean {
  const csv = process.env.LITELLM_IMAGE_API_MODELS;
  if (csv) {
    return csv
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .some((m) => model.toLowerCase().includes(m));
  }
  return /gpt-image|dall-?e|qwen-image/i.test(model);
}

/**
 * Qwen-Image 2.1 differs from the hosted image models in two ways that matter
 * here — it honours `size` literally, and it treats every extra edit image as a
 * co-equal reference. See imageApiSize() and imagesEdit() for what each implies.
 */
function isQwenImageModel(model: string): boolean {
  return /qwen-image/i.test(model);
}

/**
 * Map the aspect-ratio hint onto a supported size.
 *
 * Square-only for Qwen: it honours `size` literally (asking 1024x1536 returns
 * exactly 1024x1536), and normalizeGeneratedImage() then cover-fits and
 * CENTER-CROPS to 2048x2048 — so a portrait render would lose its top and
 * bottom. gpt-image-2 and Gemini ignore `size` and always come back ~1024
 * square, which is why the aspect hint was safe to pass before.
 *
 * 1024 (not 2048) is deliberate even though Qwen supports native 2K: at 2048 it
 * renders the subject small and thin-lined, which is wrong for coloring pages.
 * Render at 1024 and let normalizeGeneratedImage() upscale, as Gemini already does.
 */
function imageApiSize(model: string, options?: ImageGenerationOptions): string {
  if (isQwenImageModel(model)) return "1024x1024";
  switch (options?.aspectRatio) {
    case "3:4":
    case "9:16":
      return "1024x1536";
    case "4:3":
    case "16:9":
      return "1536x1024";
    default:
      return "1024x1024";
  }
}

/**
 * images API returns { data: [{ b64_json } | { url }] }; normalize to GeneratedImage.
 *
 * Both shapes are live: gpt-image-2 always answers b64_json, while
 * qwen-image-2.1 answers a MinIO asset url. Asking for
 * `response_format: "b64_json"` does not avoid the url branch — LiteLLM only
 * forwards that param on the multipart /images/edits path and drops it on JSON
 * /images/generations — so the url branch is load-bearing, not a fallback.
 *
 * The url lives on the LiteLLM host, which serves a self-signed cert, so it MUST
 * be fetched through litellmFetch: the global fetch fails TLS verification here.
 */
async function toGeneratedImage(entry: { b64_json?: string; url?: string }): Promise<GeneratedImage> {
  if (entry.b64_json) {
    return { base64: entry.b64_json, dataUrl: `data:image/png;base64,${entry.b64_json}` };
  }
  if (!entry.url) {
    throw new Error("LiteLLM images API: response entry had neither b64_json nor url");
  }

  const res = await litellmFetch(entry.url);
  if (!res.ok) {
    // Assets expire (MinIO lifecycle), so a 404 here means a stale url, not a bad request.
    throw new Error(`LiteLLM images API: failed to fetch result url (${res.status}): ${entry.url}`);
  }

  // MinIO reports some failures as an XML body under HTTP 200, so res.ok alone
  // is not enough — without this check we would hand an XML blob downstream as
  // if it were a PNG.
  const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim() || "image/png";
  if (!mime.startsWith("image/")) {
    throw new Error(
      `LiteLLM images API: result url returned ${mime}, expected an image: ${entry.url}`,
    );
  }

  const base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
  if (!base64) {
    throw new Error(`LiteLLM images API: result url returned an empty body: ${entry.url}`);
  }
  return { base64, dataUrl: `data:${mime};base64,${base64}` };
}

/** Download a URL (or decode a data: URL) into a Blob for multipart upload. */
async function fetchBlob(url: string): Promise<Blob> {
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    const meta = url.slice(5, comma);
    const body = url.slice(comma + 1);
    const bytes = meta.includes("base64") ? Buffer.from(body, "base64") : Buffer.from(decodeURIComponent(body));
    return new Blob([bytes], { type: meta.split(";")[0] || "image/png" });
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`LiteLLM: failed to download image (${res.status}): ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return new Blob([buf], { type: res.headers.get("content-type") || "image/png" });
}

async function imagesGenerate(
  prompt: string,
  model: string,
  options: ImageGenerationOptions,
): Promise<GeneratedImage> {
  const { baseUrl, apiKey } = getConfig();
  // NB: no response_format — gpt-image-2 rejects it (always returns b64_json).
  const res = await litellmFetch(`${baseUrl}/v1/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, prompt, size: imageApiSize(model, options), n: 1 }),
  });
  if (!res.ok) {
    throw new Error(`LiteLLM images/generations error (${res.status}): ${(await res.text()).slice(0, 500)}`);
  }
  const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
  return toGeneratedImage(json.data?.[0] ?? {});
}

async function imagesEdit(
  imageUrl: string,
  prompt: string,
  model: string,
  options: ColorizeOptions,
): Promise<GeneratedImage> {
  const { baseUrl, apiKey } = getConfig();
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("size", imageApiSize(model, options));
  form.append("n", "1");
  form.append("image", await fetchBlob(imageUrl), "image.png");
  // gpt-image-2 edits accept extra reference images.
  const refs = (options.referenceImageUrls ?? []).slice(0, MAX_REFERENCE_IMAGES);
  if (refs.length > 0 && isQwenImageModel(model)) {
    // Qwen-Image 2.1 weighs every image equally: it carries the extra subject's
    // identity over faithfully, but RE-RENDERS the base scene, so details the
    // prompt does not name are lost. Single-image edits stay faithful. Callers
    // that want recomposition still get it — this only makes the trade visible.
    console.warn(
      `[litellm-image] ${model}: ${refs.length} reference image(s) will re-render the base scene, not preserve it. Omit referenceImageUrls for a faithful edit.`,
    );
  }
  for (const ref of refs) {
    try {
      form.append("image", await fetchBlob(ref), "ref.png");
    } catch {
      // skip a reference that fails to download rather than failing the edit
    }
  }
  const res = await litellmFetch(`${baseUrl}/v1/images/edits`, {
    method: "POST",
    // No Content-Type — FormData sets the multipart boundary.
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form as unknown as BodyInit,
  });
  if (!res.ok) {
    throw new Error(`LiteLLM images/edits error (${res.status}): ${(await res.text()).slice(0, 500)}`);
  }
  const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
  return toGeneratedImage(json.data?.[0] ?? {});
}

export const litellmImageProvider: ImageProviderInterface = {
  async generateImage(
    prompt: string,
    options: ImageGenerationOptions = {},
  ): Promise<GeneratedImage> {
    const chosenModel = options.model?.trim() || getConfig().model;
    if (usesImagesApi(chosenModel)) {
      const image = await imagesGenerate(prompt, chosenModel, options);
      logToLangfuse("generateImage", chosenModel, prompt, image.usage, options);
      return image;
    }
    const { result, model } = await callChat(
      [{ type: "text", text: prompt }],
      aspectRatioBody(options),
      options.model,
    );
    const image = parseImageResponse(result);
    logToLangfuse("generateImage", model, prompt, image.usage, options);
    return image;
  },

  async editImage(
    imageUrl: string,
    prompt: string,
    options: ColorizeOptions = {},
  ): Promise<GeneratedImage> {
    const chosenModel = options.model?.trim() || getConfig().model;
    if (usesImagesApi(chosenModel)) {
      const image = await imagesEdit(imageUrl, prompt, chosenModel, options);
      logToLangfuse("editImage", chosenModel, prompt, image.usage, options);
      return image;
    }

    const parts: ChatMessagePart[] = [{ type: "text", text: prompt }];

    // Primary image to edit.
    parts.push({ type: "image_url", image_url: { url: await toDataUrl(imageUrl) } });

    // Optional reference images (character/location/art-style identity).
    const refs = options.referenceImageUrls?.slice(0, MAX_REFERENCE_IMAGES) ?? [];
    for (const ref of refs) {
      try {
        parts.push({ type: "image_url", image_url: { url: await toDataUrl(ref) } });
      } catch {
        // Skip references that fail to download rather than failing the edit.
      }
    }

    const { result, model } = await callChat(parts, aspectRatioBody(options), options.model);
    const image = parseImageResponse(result);
    logToLangfuse("editImage", model, prompt, image.usage, options);
    return image;
  },
};
