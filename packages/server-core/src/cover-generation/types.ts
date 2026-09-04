/**
 * Shared input for AI-driven cover generation. Consumed by both the worker's
 * stepGenerateCover and the admin's /api/generate/cover-export (AI mode).
 */
export interface CoverInput {
  /**
   * Absolute URL of the CLEAN colored illustration (no text). Model reads this
   * as its background and composites the three text roles on top.
   */
  cleanImageUrl: string;
  /**
   * Brand line to render verbatim at the bottom. Fed into the prompt as a hard
   * constraint the model must not alter.
   */
  brandName: string;
  /**
   * Optional title hint. When set, the prompt asks the model to prefer this
   * title over inventing one, unless it clashes with the illustration. Useful
   * when the caller already has a good title (e.g. from Diaflow's per-page
   * LLM output extracted by stepOneShot).
   */
  titleHint?: string;
  /** Optional subtitle hint. Same semantic as titleHint. */
  subtitleHint?: string;
  /**
   * Optional per-call image model override (LiteLLM model id, e.g. "gpt-image-2"
   * or "gemini-3.1-flash-image"). Lets an operator pick the model that renders
   * the title/subtitle/brand layout best for this cover. Empty/undefined → the
   * provider's default (LITELLM_IMAGE_MODEL).
   */
  model?: string;
  /**
   * Full R2 object key to upload the generated cover to. Example:
   *   "assets/clone-jobs/{jobId}/cover/cover-ai.png"
   *   "assets/books/{bookId}/cover-ai.png"
   */
  r2Key: string;
  /** LLM trace metadata for observability. */
  trace?: {
    caller?: string;
    entityType?: string;
    entityId?: string;
  };
}

export interface CoverOutput {
  /**
   * Final cover URL. Includes a `?v={timestamp}` cache-buster so the browser
   * always fetches the fresh bytes even though the R2 key is stable.
   */
  url: string;
  /** Same PNG bytes as base64, for immediate client-side preview. */
  base64: string;
}
