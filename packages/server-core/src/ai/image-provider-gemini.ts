/**
 * Google Gemini Image Provider — Gemini Flash Image.
 * Implements ImageProviderInterface.
 *
 * Config: GEMINI_API_KEY, GEMINI_IMAGE_MODEL (default: gemini-3.1-flash-image-preview)
 *
 * Uses generateContent endpoint with responseModalities: ["TEXT", "IMAGE"].
 * For editing: sends source image as inline_data alongside text prompt.
 */

import type {
  ImageProviderInterface,
  ImageGenerationOptions,
  GeneratedImage,
  ColorizeOptions,
  ImageUsage,
} from "./image-provider-types";
import { getLangfuse } from "../langfuse";

function getConfig() {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image-preview";

  if (!apiKey) {
    throw new Error("Gemini image provider not configured. Set GEMINI_API_KEY.");
  }

  return { apiKey, model };
}

function parseGeminiResponse(result: Record<string, unknown>): GeneratedImage {
  const candidates = result.candidates as
    | Array<{ content?: { parts?: Array<Record<string, unknown>> } }>
    | undefined;

  if (!candidates?.length) {
    const preview = JSON.stringify(result).slice(0, 500);
    throw new Error(`No candidates in Gemini response: ${preview}`);
  }

  const parts = candidates[0]?.content?.parts || [];

  // Extract token usage from usageMetadata
  const meta = result.usageMetadata as
    | { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
    | undefined;
  const usage: ImageUsage | undefined = meta
    ? {
        promptTokens: meta.promptTokenCount,
        completionTokens: meta.candidatesTokenCount,
        totalTokens: meta.totalTokenCount,
      }
    : undefined;

  // Gemini REST returns camelCase: inlineData (not inline_data), mimeType (not mime_type)
  for (const part of parts) {
    const inlineData = (part.inlineData ?? part.inline_data) as
      | { data?: string; mimeType?: string; mime_type?: string }
      | undefined;
    if (inlineData?.data) {
      const mime = inlineData.mimeType || inlineData.mime_type || "image/png";
      return { base64: inlineData.data, dataUrl: `data:${mime};base64,${inlineData.data}`, usage };
    }
  }

  const partKeys = parts.map((p) => Object.keys(p).join(",")).join(" | ");
  throw new Error(`No image data in Gemini response. Part keys: [${partKeys}]`);
}

function logGeminiToLangfuse(
  operation: string,
  model: string,
  prompt: string,
  usage: ImageUsage | undefined,
  options?: ImageGenerationOptions,
) {
  const lf = getLangfuse();
  if (!lf) return;
  const trace = lf.trace({
    name: options?.trace?.caller || `gemini/${operation}`,
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

async function downloadAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download image (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "image/png";
  return { data: buffer.toString("base64"), mimeType: contentType };
}

export const geminiImageProvider: ImageProviderInterface = {
  async generateImage(
    prompt: string,
    _options: ImageGenerationOptions = {},
  ): Promise<GeneratedImage> {
    const { apiKey, model } = getConfig();

    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    };

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini image generation error (${res.status}): ${err}`);
    }

    const image = parseGeminiResponse(await res.json());
    logGeminiToLangfuse("generateImage", model, prompt, image.usage, _options);
    return image;
  },

  async editImage(
    imageUrl: string,
    prompt: string,
    options: ColorizeOptions = {},
  ): Promise<GeneratedImage> {
    const { apiKey, model } = getConfig();
    const { referenceImageUrls } = options;

    // Build parts: text prompt + source image + optional reference images
    const parts: Array<Record<string, unknown>> = [{ text: prompt }];

    // Primary image to edit (support data URLs)
    let primaryImg: { data: string; mimeType: string };
    if (imageUrl.startsWith("data:")) {
      const [header, data] = imageUrl.split(",");
      const mimeType = header.match(/data:(.*?);/)?.[1] || "image/png";
      primaryImg = { data, mimeType };
    } else {
      primaryImg = await downloadAsBase64(imageUrl);
    }
    parts.push({
      inlineData: { mimeType: primaryImg.mimeType, data: primaryImg.data },
    });

    // Style reference images
    if (referenceImageUrls?.length) {
      for (let i = 0; i < referenceImageUrls.length && i < 2; i++) {
        try {
          const refImg = await downloadAsBase64(referenceImageUrls[i]);
          parts.push({
            inlineData: { mimeType: refImg.mimeType, data: refImg.data },
          });
        } catch {
          // Skip failed reference downloads
        }
      }
    }

    const body = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    };

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini image edit error (${res.status}): ${err}`);
    }

    const image = parseGeminiResponse(await res.json());
    logGeminiToLangfuse("editImage", model, prompt, image.usage, options);
    return image;
  },
};
