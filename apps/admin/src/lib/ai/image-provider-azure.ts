/**
 * Azure OpenAI Image Provider — GPT-image-2.
 * Implements ImageProviderInterface.
 */

import type {
  ImageProviderInterface,
  ImageGenerationOptions,
  GeneratedImage,
  ColorizeOptions,
} from "./image-provider-types";

function getConfig() {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_IMAGE_DEPLOYMENT_NAME || "gpt-image-2";
  const apiVersion = process.env.OPENAI_API_VERSION || "2025-04-01-preview";

  if (!endpoint || !apiKey) {
    throw new Error(
      "Azure image provider not configured. Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY.",
    );
  }

  return { endpoint, apiKey, deployment, apiVersion };
}

function parseBase64Response(result: Record<string, unknown>): GeneratedImage {
  const data = result.data as Array<{ b64_json?: string }> | undefined;
  const base64 = data?.[0]?.b64_json;
  if (!base64) throw new Error("No image data in Azure response");
  return { base64, dataUrl: `data:image/png;base64,${base64}` };
}

export const azureImageProvider: ImageProviderInterface = {
  async generateImage(
    prompt: string,
    options: ImageGenerationOptions = {},
  ): Promise<GeneratedImage> {
    const { endpoint, apiKey, deployment, apiVersion } = getConfig();
    const { size = "1024x1024", n = 1 } = options;

    const isGptImage = deployment.startsWith("gpt-image");
    const body: Record<string, unknown> = { prompt, n, size };
    if (isGptImage) {
      body.output_format = "png";
    } else {
      body.response_format = "b64_json";
    }

    const res = await fetch(
      `${endpoint}/openai/deployments/${deployment}/images/generations?api-version=${apiVersion}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": apiKey },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Azure image generation error (${res.status}): ${err}`);
    }

    return parseBase64Response(await res.json());
  },

  async editImage(
    imageUrl: string,
    prompt: string,
    options: ColorizeOptions = {},
  ): Promise<GeneratedImage> {
    const { endpoint, apiKey, deployment, apiVersion } = getConfig();
    const { size = "1024x1024", n = 1, referenceImageUrls } = options;

    // Download primary image
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) throw new Error(`Failed to download source image (${imageRes.status})`);
    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());

    // Build multipart form data
    const formData = new FormData();
    formData.append("image[]", new Blob([imageBuffer], { type: "image/png" }), "page.png");

    // Add style reference images
    if (referenceImageUrls?.length) {
      for (let i = 0; i < referenceImageUrls.length && i < 2; i++) {
        try {
          const refRes = await fetch(referenceImageUrls[i]);
          if (refRes.ok) {
            const refBuffer = Buffer.from(await refRes.arrayBuffer());
            formData.append(
              "image[]",
              new Blob([refBuffer], { type: "image/png" }),
              `ref-${i}.png`,
            );
          }
        } catch {
          // Skip failed reference downloads
        }
      }
    }

    formData.append("prompt", prompt);
    formData.append("n", String(n));
    formData.append("size", size);

    const res = await fetch(
      `${endpoint}/openai/deployments/${deployment}/images/edits?api-version=${apiVersion}`,
      {
        method: "POST",
        headers: { "api-key": apiKey },
        body: formData,
      },
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Azure image edit error (${res.status}): ${err}`);
    }

    return parseBase64Response(await res.json());
  },
};
