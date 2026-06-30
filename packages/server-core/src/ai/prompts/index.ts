/**
 * Prompts — barrel re-export for all AI prompt templates.
 */

export { EXTRACTION_PROMPT } from "./extraction-prompt";

export { CLONE_EXTRACTION_PROMPT } from "./clone-extraction-prompt";

export { buildReproductionPrompt } from "./clone-prompt-builder";

export { buildColorizationPrompt } from "./colorization-prompt-template";

export {
  ART_STYLE_EXTRACTION_PROMPT,
  buildDirectiveFromProperties,
} from "./art-style-prompts";

export {
  COLORING_STYLE_EXTRACTION_PROMPT,
  buildColorizationDirective,
} from "./coloring-style-prompts";

export { buildStoryOutlinePrompt } from "./story-outline-prompt";

export {
  buildSubtitlePrompt,
  buildColoringPagePrompt,
  buildAutoPromptsFromTitle,
  buildCombinedPagePrompt,
  buildCategoryIconPrompt,
  buildColoringPageGenerationPrompt,
} from "./page-generation-prompts";

export { buildCharacterExtractionPrompt } from "./character-extraction-prompt";

export { buildLocationExtractionPrompt } from "./location-extraction-prompt";

export { buildRedesignPrompt } from "./redesign-prompts";
