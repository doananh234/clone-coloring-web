/**
 * Page Generation Prompts — prompts for generating coloring book pages.
 */

export function buildSubtitlePrompt(title: string, description?: string): string {
  return `Generate a short, catchy subtitle (under 10 words) for a coloring book titled "${title}"${description ? `. Description: ${description}` : ""}. Return only the subtitle text, no quotes.`;
}

export function buildColoringPagePrompt(subject: string, style?: string): string {
  const styleHint = style || "detailed black and white line art";
  return `${subject}, ${styleHint}, coloring book page, clean outlines, no shading, no color fill, white background, suitable for coloring`;
}

export function buildAutoPromptsFromTitle(title: string, count: number = 5): string[] {
  const base = title.replace(/coloring book/i, "").trim();
  const templates = [
    `A detailed ${base} illustration for coloring, black outlines on white background, no shading`,
    `${base} mandala pattern for coloring, intricate details, black line art on white`,
    `Cute ${base} scene for coloring book, simple clean outlines, white background`,
    `${base} zentangle design for coloring, decorative patterns, black and white line art`,
    `${base} nature scene for coloring, detailed botanical elements, clean outlines`,
    `${base} fantasy illustration for coloring, magical elements, detailed line art`,
    `${base} portrait for coloring, expressive features, bold outlines on white`,
    `${base} pattern design for coloring, repeating motifs, symmetrical, clean lines`,
  ];
  return templates.slice(0, count);
}

export function buildCombinedPagePrompt(characterPrompt: string, locationPrompt?: string): string {
  if (locationPrompt) {
    return `${characterPrompt}, set in ${locationPrompt}, black and white coloring book page, clean outlines, no shading, white background`;
  }
  return `${characterPrompt}, black and white coloring book page, clean outlines, no shading, white background`;
}

export function buildCategoryIconPrompt(prompt: string): string {
  return `Create a cute, colorful icon for a coloring book category. Style: kawaii, pastel colors, simple clean design, white background, centered subject. Category: ${prompt}`;
}

/**
 * Build a full coloring page generation prompt with optional art style directive.
 * Used by image-provider for scene-based coloring page generation.
 */
export function buildColoringPageGenerationPrompt(
  scenePrompt: string,
  artStyleDirective?: string,
): string {
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
