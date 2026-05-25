/**
 * AI Services — centralized exports.
 *
 * Usage in API routes:
 *   import { textPrompt, visionAnalyzeJSON, generateImage } from "@/lib/ai";
 *   import { EXTRACTION_PROMPT, buildSubtitlePrompt } from "@/lib/ai";
 *
 * Required env vars (server-side, in .env.local):
 *   AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
 *   AZURE_OPENAI_API_KEY=your-api-key
 *   AZURE_LLM_DEPLOYMENT_NAME=gpt-4o           (optional, default: gpt-4o)
 *   AZURE_IMAGE_DEPLOYMENT_NAME=gpt-image-2     (optional, default: gpt-image-2)
 *   OPENAI_API_VERSION=2025-04-01-preview       (optional)
 */

// LLM Provider (text + vision)
export {
  chatCompletion,
  textPrompt,
  visionAnalyze,
  visionAnalyzeJSON,
  type LLMMessage,
  type LLMOptions,
  type LLMResponse,
} from "./llm-provider";

// Image Provider
export {
  generateImage,
  editImage,
  generateCharacterReference,
  generateLocationReference,
  generateBookCover,
  generateCategoryIcon,
  generateColoringPage,
  colorizeImage,
  type ImageGenerationOptions,
  type GeneratedImage,
  type CharacterExtractionOptions,
  type LocationExtractionOptions,
  type ColoringPageOptions,
} from "./image-provider";

// Prompt Templates
export {
  EXTRACTION_PROMPT,
  buildSubtitlePrompt,
  buildColoringPagePrompt,
  buildAutoPromptsFromTitle,
  buildCombinedPagePrompt,
  buildStoryOutlinePrompt,
  ART_STYLE_EXTRACTION_PROMPT,
  buildDirectiveFromProperties,
  COLORING_STYLE_EXTRACTION_PROMPT,
  buildColorizationDirective,
} from "./prompts";

// Art Style Types
export type { ArtStyleEntity } from "./art-style-types";
export { EMPTY_ART_STYLE } from "./art-style-types";

// Coloring Style Types
export type { ColoringStyleEntity } from "./coloring-style-types";
export { EMPTY_COLORING_STYLE } from "./coloring-style-types";
