/**
 * Image Provider Interface — abstract contract for image generation/editing.
 * Implementations: Azure OpenAI (GPT-image-2), Google Gemini, Vertex AI.
 * Switch provider via IMAGE_PROVIDER env var ("azure" | "gemini" | "vertex").
 */

/** Selectable image backends. The factory falls back to IMAGE_PROVIDER env. */
export type ImageProviderName = "azure" | "diaflow" | "kingcong" | "vertex" | "gemini" | "litellm";

export type ImageGenerationOptions = {
  size?: "1024x1024" | "1024x1792" | "1792x1024";
  quality?: "standard" | "hd";
  n?: number;
  /**
   * Per-call provider override. When set, this wins over the IMAGE_PROVIDER env
   * so a single request (e.g. an operator-chosen cover/regen) can pick KingCong
   * or Diaflow regardless of the process default.
   */
  provider?: ImageProviderName;
  /**
   * Output aspect ratio hint. Passed to Gemini image models (via LiteLLM) as
   * generationConfig.imageConfig.aspectRatio. Providers that don't support it
   * ignore this.
   */
  aspectRatio?: "1:1" | "3:4" | "4:3" | "16:9" | "9:16";
  /**
   * Per-call model override. Currently only the LiteLLM provider honors it
   * (wins over LITELLM_IMAGE_MODEL) so an operator can pick e.g. "gpt-image-2"
   * vs "gemini-3.1-flash-image" for a single generation. Other providers ignore it.
   */
  model?: string;
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
  /**
   * Diaflow flow override for the underlying image-to-image call.
   * Defaults to "image". Cover generation passes "gpt_image" to route
   * through Diaflow's GPT-image flow. Non-Diaflow providers ignore this.
   * Output handling is identical — both flows return an "image" output_type.
   */
  flow?: "image" | "gpt_image";
};

export interface ImageProviderInterface {
  /** Generate an image from a text prompt */
  generateImage(prompt: string, options?: ImageGenerationOptions): Promise<GeneratedImage>;

  /** Edit/colorize an image: takes source image URL + prompt, returns modified image */
  editImage(imageUrl: string, prompt: string, options?: ColorizeOptions): Promise<GeneratedImage>;
}
