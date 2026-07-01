/**
 * Google Vertex AI Image Provider — Gemini via Vertex AI.
 * Implements ImageProviderInterface.
 *
 * Config:
 *   GOOGLE_CLOUD_PROJECT   — GCP project ID (required)
 *   GOOGLE_CLOUD_REGION    — GCP region (default: us-central1)
 *   VERTEX_IMAGE_MODEL     — model name (default: gemini-2.0-flash-preview-image-generation)
 *
 * Auth: Uses Google Application Default Credentials (ADC).
 *   - Local dev: set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path
 *   - Cloud Run / GKE: auto-detected from metadata server
 *   - Firebase Admin SDK service account also works if GOOGLE_APPLICATION_CREDENTIALS points to it
 */

import type {
  ImageProviderInterface,
  ImageGenerationOptions,
  GeneratedImage,
  ColorizeOptions,
  ImageUsage,
} from "./image-provider-types";
import { getLangfuse } from "../langfuse";

let cachedAuth: { getAccessToken: () => Promise<string> } | null = null;

async function getAuth(): Promise<{ getAccessToken: () => Promise<string> }> {
  if (cachedAuth) return cachedAuth;

  const { GoogleAuth } = await import("google-auth-library");
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });

  cachedAuth = {
    getAccessToken: async () => {
      const client = await auth.getClient();
      const tokenResponse = await client.getAccessToken();
      const token = tokenResponse.token;
      if (!token) throw new Error("Failed to obtain access token from ADC");
      return token;
    },
  };

  return cachedAuth;
}

function getConfig() {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const region = process.env.GOOGLE_CLOUD_REGION || "us-central1";
  const model = process.env.VERTEX_IMAGE_MODEL || "gemini-2.0-flash-preview-image-generation";

  if (!project) {
    throw new Error("Vertex AI image provider not configured. Set GOOGLE_CLOUD_PROJECT.");
  }

  return { project, region, model };
}

function buildEndpointUrl(project: string, region: string, model: string): string {
  return `https://${region}-aiplatform.googleapis.com/v1/projects/${project}/locations/${region}/publishers/google/models/${model}:generateContent`;
}

function parseVertexResponse(result: Record<string, unknown>): GeneratedImage {
  const candidates = result.candidates as
    | Array<{ content?: { parts?: Array<Record<string, unknown>> } }>
    | undefined;

  if (!candidates?.length) {
    const preview = JSON.stringify(result).slice(0, 500);
    throw new Error(`No candidates in Vertex AI response: ${preview}`);
  }

  const parts = candidates[0]?.content?.parts || [];

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
  throw new Error(`No image data in Vertex AI response. Part keys: [${partKeys}]`);
}

function logVertexToLangfuse(
  operation: string,
  model: string,
  prompt: string,
  usage: ImageUsage | undefined,
  options?: ImageGenerationOptions,
) {
  const lf = getLangfuse();
  if (!lf) return;
  const trace = lf.trace({
    name: options?.trace?.caller || `vertex/${operation}`,
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

export const vertexImageProvider: ImageProviderInterface = {
  async generateImage(
    prompt: string,
    _options: ImageGenerationOptions = {},
  ): Promise<GeneratedImage> {
    const { project, region, model } = getConfig();
    const auth = await getAuth();
    const accessToken = await auth.getAccessToken();

    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    };

    const res = await fetch(buildEndpointUrl(project, region, model), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Vertex AI image generation error (${res.status}): ${err}`);
    }

    const image = parseVertexResponse(await res.json());
    logVertexToLangfuse("generateImage", model, prompt, image.usage, _options);
    return image;
  },

  async editImage(
    imageUrl: string,
    prompt: string,
    options: ColorizeOptions = {},
  ): Promise<GeneratedImage> {
    const { project, region, model } = getConfig();
    const { referenceImageUrls } = options;
    const auth = await getAuth();
    const accessToken = await auth.getAccessToken();

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

    const res = await fetch(buildEndpointUrl(project, region, model), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Vertex AI image edit error (${res.status}): ${err}`);
    }

    const image = parseVertexResponse(await res.json());
    logVertexToLangfuse("editImage", model, prompt, image.usage, options);
    return image;
  },
};
