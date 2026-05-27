/**
 * Image Provider — unified facade for image generation and editing.
 *
 * Delegates to Azure OpenAI or Google Gemini based on IMAGE_PROVIDER env var.
 * Default: "azure". Set IMAGE_PROVIDER=gemini to switch.
 *
 * All callers import from this file — never from provider-specific files.
 */

import type {
  ImageProviderInterface,
  ImageGenerationOptions,
  GeneratedImage,
  ColorizeOptions,
} from "./image-provider-types";
import { buildCharacterExtractionPrompt } from "./prompts/character-extraction-prompt";
import { buildLocationExtractionPrompt } from "./prompts/location-extraction-prompt";
import {
  buildCategoryIconPrompt,
  buildColoringPageGenerationPrompt,
} from "./prompts/page-generation-prompts";

// Re-export types so callers don't need to import from types file
export type { ImageGenerationOptions, GeneratedImage, ColorizeOptions };

function getProvider(): ImageProviderInterface {
  const provider = process.env.IMAGE_PROVIDER || "azure";

  if (provider === "gemini") {
    // Dynamic require to avoid loading unused provider
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./image-provider-gemini").geminiImageProvider;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./image-provider-azure").azureImageProvider;
}

/**
 * Normalize image URL: resolve relative R2 paths to full URLs.
 * Ensures any /assets/... path becomes https://cdn.example.com/assets/...
 */
function normalizeImageUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:"))
    return url;
  const base = (
    process.env.R2_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ||
    ""
  ).replace(/\/$/, "");
  if (base) return `${base}/${url.replace(/^\//, "")}`;
  return url;
}

// --- Core functions (delegate to active provider) ---

export async function generateImage(
  prompt: string,
  options?: ImageGenerationOptions,
): Promise<GeneratedImage> {
  return getProvider().generateImage(prompt, options);
}

export async function editImage(
  imageUrl: string,
  prompt: string,
  options?: ColorizeOptions,
): Promise<GeneratedImage> {
  return getProvider().editImage(normalizeImageUrl(imageUrl), prompt, options);
}

// --- Domain-specific wrappers ---

export type CharacterExtractionOptions = ImageGenerationOptions & {
  /** URL of the original page image to extract from (enables image-to-image extraction) */
  sourceImageUrl?: string;
  /** Character name for targeted extraction when multiple characters exist */
  characterName?: string;
  /** Additional character info to help identify the target character */
  characterInfo?: string;
};

export type LocationExtractionOptions = ImageGenerationOptions & {
  /** URL of the original page image to extract from (enables image-to-image extraction) */
  sourceImageUrl?: string;
  /** Location name for targeted extraction */
  locationName?: string;
};

/**
 * Generate a 1x1 white pixel PNG as a blank canvas for editImage.
 * This forces the AI to generate fresh instead of modifying an existing scene.
 */
const BLANK_WHITE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
let _blankWhiteDataUrl: string | null = null;
function getBlankWhiteDataUrl(): string {
  if (!_blankWhiteDataUrl) {
    _blankWhiteDataUrl = `data:image/png;base64,${BLANK_WHITE_PNG_BASE64}`;
  }
  return _blankWhiteDataUrl;
}

export async function generateCharacterReference(
  characterPrompt: string,
  options?: CharacterExtractionOptions,
): Promise<GeneratedImage> {
  const { sourceImageUrl, characterName, characterInfo, ...imageOptions } = options || {};

  const prompt = buildCharacterExtractionPrompt(characterPrompt, characterName, characterInfo);

  if (sourceImageUrl) {
    // Use blank white image as edit base + source scene as reference.
    // This way AI generates on white canvas but sees the character from the reference.
    return editImage(getBlankWhiteDataUrl(), prompt, {
      ...imageOptions,
      referenceImageUrls: [normalizeImageUrl(sourceImageUrl)],
    });
  }

  return generateImage(prompt, imageOptions);
}

export async function generateLocationReference(
  locationPrompt: string,
  options?: LocationExtractionOptions,
): Promise<GeneratedImage> {
  const { sourceImageUrl, locationName, ...imageOptions } = options || {};

  const prompt = buildLocationExtractionPrompt(locationPrompt, locationName);

  if (sourceImageUrl) {
    return editImage(getBlankWhiteDataUrl(), prompt, {
      ...imageOptions,
      referenceImageUrls: [normalizeImageUrl(sourceImageUrl)],
    });
  }

  return generateImage(prompt, imageOptions);
}

export async function generateBookCover(
  title: string,
  description?: string,
  options?: ImageGenerationOptions,
): Promise<GeneratedImage> {
  return generateImage(
    `Professional book cover for "${title}" coloring book. Vibrant colors, eye-catching design. ${description || ""}`,
    options,
  );
}

export async function generateCategoryIcon(
  prompt: string,
  options?: ImageGenerationOptions,
): Promise<GeneratedImage> {
  return generateImage(buildCategoryIconPrompt(prompt), options);
}

export type ColoringPageOptions = ImageGenerationOptions & {
  artStyle?: {
    referenceImageUrls: string[];
    generationDirective: string;
  };
  /** Character reference image URLs — passed as visual context so the AI preserves character identity */
  characterReferenceImageUrls?: string[];
  /** Location reference image URLs — passed as visual context for environment consistency */
  locationReferenceImageUrls?: string[];
};

export async function generateColoringPage(
  prompt: string,
  options?: ColoringPageOptions,
): Promise<GeneratedImage> {
  const { artStyle, characterReferenceImageUrls, locationReferenceImageUrls, ...imageOptions } =
    options || {};

  const sizeOpts = { size: "1024x1024" as const, ...imageOptions };
  const fullPrompt = buildColoringPageGenerationPrompt(prompt, artStyle?.generationDirective);

  // Collect all reference image URLs (character + location + art style)
  const allReferenceUrls: string[] = [
    ...(characterReferenceImageUrls || []),
    ...(locationReferenceImageUrls || []),
    ...(artStyle?.referenceImageUrls || []),
  ].filter(Boolean);

  // Use editImage when we have reference images for character/location identity preservation
  if (allReferenceUrls.length > 0) {
    // First reference image is the "primary" input, rest are additional references
    const [primaryUrl, ...restUrls] = allReferenceUrls;
    return editImage(primaryUrl, fullPrompt, {
      ...sizeOpts,
      referenceImageUrls: restUrls.length > 0 ? restUrls : undefined,
    });
  }

  return generateImage(fullPrompt, sizeOpts);
}

export async function colorizeImage(
  imageUrl: string,
  colorizationDirective: string,
  options: ColorizeOptions = {},
): Promise<GeneratedImage> {
  const { buildColorizationPrompt } = await import("./prompts/colorization-prompt-template");
  const colorizePrompt = buildColorizationPrompt(colorizationDirective);
  return editImage(imageUrl, colorizePrompt, options);
}
