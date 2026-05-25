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

function buildCharacterExtractionPrompt(
  characterPrompt: string,
  characterName?: string,
  characterInfo?: string,
): string {
  const targetingSection =
    characterName || characterInfo
      ? `Look at this image. There are multiple characters in it.
I need you to extract ONLY this specific character: "${characterName || ""}${characterInfo ? ` — ${characterInfo}` : ""}"
Look at this image carefully. Extract ONLY this specific character: "${characterInfo || characterName || ""}"
Ignore all other characters, objects, and background elements.`
      : `Extract the main character from this image.`;

  return `${targetingSection}

CRITICAL REQUIREMENTS:
1. Draw the COMPLETE FULL BODY of this character — head, torso, arms, hands, legs, and feet must ALL be visible
2. If the character is partially hidden (behind furniture, objects, other characters, or cropped by the image edge), you MUST imagine and complete the hidden parts based on the visible anatomy and art style
3. The character must be shown in a neutral standing pose facing forward (3/4 view is acceptable)
4. Show the character from head to toe — no cropping at any edge

STYLE REQUIREMENTS:
- Clean black and white line art only
- Pure white background with absolutely nothing else except the character
- Thick, clean black outlines
- No shading, no gradients, no color, no grey tones, no fill
- Preserve the character's exact art style, proportions, clothing, accessories, and facial features
- Coloring book style — simple clean lines suitable for coloring

CHARACTER REFERENCE: ${characterPrompt}

This extracted character will be reused to draw this exact character in many different scenes and poses, so the full body reference is essential.`;
}

function buildLocationExtractionPrompt(locationPrompt: string, locationName?: string): string {
  const targetingSection = locationName
    ? `Look at this image. Extract ONLY the location/environment: "${locationName}"
Ignore all characters, people, and foreground subjects.`
    : `Extract the background location/environment from this image.
Remove all characters, people, and foreground subjects.`;

  return `${targetingSection}

CRITICAL REQUIREMENTS:
1. Show ONLY the environment/scene — no characters, no people, no animals
2. If parts of the background are hidden behind characters, you MUST imagine and complete those hidden areas to create a seamless environment
3. Maintain the scene's perspective, depth, and spatial layout
4. Include all environmental details: architecture, vegetation, furniture, props, sky, ground

STYLE REQUIREMENTS:
- Clean black and white line art only
- Pure white or appropriate background
- Thick, clean black outlines
- No shading, no gradients, no color, no grey tones, no fill
- Preserve the original art style of the scene
- Coloring book style — simple clean lines suitable for coloring

LOCATION REFERENCE: ${locationPrompt}

This extracted location will be reused as a background for placing characters in different scenes, so completeness and consistency are essential.`;
}

export async function generateCharacterReference(
  characterPrompt: string,
  options?: CharacterExtractionOptions,
): Promise<GeneratedImage> {
  const { sourceImageUrl, characterName, characterInfo, ...imageOptions } = options || {};

  const prompt = buildCharacterExtractionPrompt(characterPrompt, characterName, characterInfo);

  // Use image-to-image extraction when source image is available
  if (sourceImageUrl) {
    return editImage(sourceImageUrl, prompt, imageOptions);
  }

  // Fallback to text-only generation when no source image
  return generateImage(prompt, imageOptions);
}

export async function generateLocationReference(
  locationPrompt: string,
  options?: LocationExtractionOptions,
): Promise<GeneratedImage> {
  const { sourceImageUrl, locationName, ...imageOptions } = options || {};

  const prompt = buildLocationExtractionPrompt(locationPrompt, locationName);

  // Use image-to-image extraction when source image is available
  if (sourceImageUrl) {
    return editImage(sourceImageUrl, prompt, imageOptions);
  }

  // Fallback to text-only generation when no source image
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
  return generateImage(
    `Create a cute, colorful icon for a coloring book category. Style: kawaii, pastel colors, simple clean design, white background, centered subject. Category: ${prompt}`,
    options,
  );
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

function buildColoringPagePrompt(scenePrompt: string, artStyleDirective?: string): string {
  const styleSection = artStyleDirective
    ? `[SYSTEM STYLE RULES - MANDATORY OVERRIDE]
These rules are absolute. Strictly follow them even if CHARACTER REFERENCE IMAGEs have a different style.
${artStyleDirective}

REFERENCE IMAGE POLICY: Use provided character/location images ONLY to identify identity, features, and proportions. You are explicitly forbidden from adopting the line-art style of the reference images. Reinterpret all characters using the System Style Rules above.`
    : `[SYSTEM STYLE RULES]
Use clean, uniform black outlines on pure white background. Coloring book style line art.`;

  return `Role: Expert Coloring Book Illustrator.
CORE DIRECTIVE: You are an immutable drawing engine with a fixed, technical line-art style. Your artistic style is strict and cannot be altered by reference images.

${styleSection}

[SCENE TO DRAW]
${scenePrompt}

[OUTPUT REQUIREMENTS]
- Black and white line art coloring book page, square 1:1 format
- Pure black (#000000) lines on solid white (#FFFFFF) background
- No shading, no gray tones, no gradients, no textures, no solid fills
- No color other than pure black lines on white background
- No opacity, no glow, no lighting effects
- All lines must be clean, smooth, and of consistent weight
- If any object implies color (e.g., glowing, magical, screen effects), represent it using line shapes only

CONFLICT RESOLUTION: If the reference images suggest bold, thick outlines different from the style rules, disregard those modifiers. Execute only the content and character likeness using the style format specified above.`;
}

export async function generateColoringPage(
  prompt: string,
  options?: ColoringPageOptions,
): Promise<GeneratedImage> {
  const { artStyle, characterReferenceImageUrls, locationReferenceImageUrls, ...imageOptions } =
    options || {};

  const sizeOpts = { size: "1024x1024" as const, ...imageOptions };
  const fullPrompt = buildColoringPagePrompt(prompt, artStyle?.generationDirective);

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
  const { buildColorizationPrompt } = await import("./colorization-prompt-template");
  const colorizePrompt = buildColorizationPrompt(colorizationDirective);
  return editImage(imageUrl, colorizePrompt, options);
}
