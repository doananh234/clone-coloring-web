/**
 * @vx/server-core — server-side utilities shared by admin and worker apps.
 *
 * Root barrel re-exports the most common items (AI provider + prompts).
 * For more specific items use subpath imports:
 *   import { ... } from "@vx/server-core/ai";
 *   import { ... } from "@vx/server-core/r2";
 *   import { ... } from "@vx/server-core/pdf-renderer";
 *   import { ... } from "@vx/server-core/langfuse";
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
} from "./ai/llm-provider";

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
  generateCoverSource,
  type ImageGenerationOptions,
  type GeneratedImage,
  type CharacterExtractionOptions,
  type LocationExtractionOptions,
  type ColoringPageOptions,
} from "./ai/image-provider";

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
  CLONE_EXTRACTION_PROMPT,
  buildReproductionPrompt,
  buildColorizationPrompt,
  buildCharacterExtractionPrompt,
  buildLocationExtractionPrompt,
  buildCategoryIconPrompt,
  buildRedesignPrompt,
} from "./ai/prompts";

// Art Style Types
export type { ArtStyleEntity } from "./ai/art-style-types";
export { EMPTY_ART_STYLE } from "./ai/art-style-types";

// Coloring Style Types
export type { ColoringStyleEntity } from "./ai/coloring-style-types";
export { EMPTY_COLORING_STYLE } from "./ai/coloring-style-types";
