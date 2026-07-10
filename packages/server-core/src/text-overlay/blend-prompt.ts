/**
 * AI blend prompt for the text-overlay pipeline.
 * Instructs the image-edit model to merge overlaid text into the illustration
 * without altering colors, characters, or the text itself. Single source of
 * truth shared by the worker's stepGenerateCover and the admin's
 * /api/generate/text-overlay-blend route.
 */
export const BLEND_PROMPT: string =
  "This is a colorful illustrated book cover with text overlaid on it. There may be up to THREE separate text elements: (1) a large TITLE near the top, (2) a smaller SUBTITLE or tagline in the middle-to-bottom area, and (3) a small BRAND, imprint, publisher, or byline near the very bottom of the cover. COUNT every piece of text you see BEFORE editing and preserve EVERY SINGLE ONE — including any short brand or byline line at the bottom. Make ALL text blend naturally into the illustration style — match the art style for the lettering while keeping every piece of text perfectly readable and correctly spelled. IMPORTANT: Preserve ALL original colors, characters, illustration details, AND every text element (title, subtitle, AND brand/byline) exactly as written. Do not remove any text, do not merge text lines, do not omit the small brand or byline text near the bottom, do not convert to black and white, do not change the color palette. Only modify how the text integrates visually into the art style.";
