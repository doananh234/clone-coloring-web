/**
 * LiteLLM Image Provider — image generation/editing via a LiteLLM proxy.
 * Implements ImageProviderInterface.
 *
 * Config:
 *   LITELLM_BASE_URL   e.g. https://litellm-dev.diaflow.io
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

import type {
  ImageProviderInterface,
  ImageGenerationOptions,
  GeneratedImage,
  ColorizeOptions,
  ImageUsage,
} from "./image-provider-types";
import { getLangfuse } from "../langfuse";

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
): Promise<{ result: Record<string, unknown>; model: string }> {
  const { baseUrl, apiKey, model } = getConfig();

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
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

export const litellmImageProvider: ImageProviderInterface = {
  async generateImage(
    prompt: string,
    options: ImageGenerationOptions = {},
  ): Promise<GeneratedImage> {
    const { result, model } = await callChat(
      [{ type: "text", text: prompt }],
      aspectRatioBody(options),
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

    const { result, model } = await callChat(parts, aspectRatioBody(options));
    const image = parseImageResponse(result);
    logToLangfuse("editImage", model, prompt, image.usage, options);
    return image;
  },
};
