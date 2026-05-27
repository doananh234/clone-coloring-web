/**
 * Image Provider Interface — abstract contract for image generation/editing.
 * Implementations: Azure OpenAI (GPT-image-2), Google Gemini.
 * Switch provider via IMAGE_PROVIDER env var ("azure" | "gemini").
 */

export type ImageGenerationOptions = {
  size?: "1024x1024" | "1024x1792" | "1792x1024";
  quality?: "standard" | "hd";
  n?: number;
  /** Langfuse trace metadata for cost tracking */
  trace?: { caller?: string; entityType?: string; entityId?: string };
};

export type ImageUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type GeneratedImage = {
  base64: string;
  dataUrl: string;
  usage?: ImageUsage;
};

export type ColorizeOptions = ImageGenerationOptions & {
  referenceImageUrls?: string[];
};

export interface ImageProviderInterface {
  /** Generate an image from a text prompt */
  generateImage(prompt: string, options?: ImageGenerationOptions): Promise<GeneratedImage>;

  /** Edit/colorize an image: takes source image URL + prompt, returns modified image */
  editImage(imageUrl: string, prompt: string, options?: ColorizeOptions): Promise<GeneratedImage>;
}
