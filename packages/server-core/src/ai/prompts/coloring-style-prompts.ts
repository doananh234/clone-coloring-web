/**
 * Coloring Style Prompts — extraction and directive building for coloring styles.
 */

export const COLORING_STYLE_EXTRACTION_PROMPT = `Analyze how colors are applied in these colored coloring book pages. Focus on the coloring TECHNIQUE, not the line art. Extract detailed properties about how colors fill the page.

Return a JSON object with this exact structure:
{
  "name": "suggested coloring style name (e.g. Soft Watercolor Wash, Bold Crayon Fill, Pastel Pencil Blend)",
  "description": "one-paragraph summary of the coloring approach and feel",
  "medium": {
    "technique": "watercolor|crayon|colored pencil|digital flat|marker|pastel|oil pastel|mixed",
    "texture": "smooth|grainy|streaky|blended|rough",
    "description": "1-2 sentences on medium nuances — how the tool is wielded"
  },
  "colorPalette": {
    "primaryColors": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5", "#hex6"],
    "accentColors": ["#hex1", "#hex2", "#hex3"],
    "backgroundTone": "white|cream|warm beige|cool gray|transparent",
    "warmth": "warm|cool|neutral",
    "saturation": "muted|vibrant|pastel|neon|earthy",
    "description": "1-2 sentences on palette character and color relationships"
  },
  "shadingAndLighting": {
    "shadingStyle": "flat|gradient|soft shadow|hard shadow|none",
    "lightDirection": "top-left|top-right|ambient|dramatic|none",
    "highlightTreatment": "white spots|light areas|none|sparkle",
    "shadowColorTendency": "darker shade|purple tint|blue tint|warm brown",
    "description": "1-2 sentences on lighting nuances"
  },
  "fillBehavior": {
    "edgeBleed": "stay inside lines|slight bleed|artistic overflow",
    "opacity": "solid|translucent|layered",
    "coverage": "full fill|partial|sketch-like|heavy impasto",
    "description": "1-2 sentences on how color fills the shapes"
  },
  "overallFeel": {
    "mood": "cheerful|moody|dreamy|vintage|playful",
    "ageFeel": "childlike|professional|artistic|whimsical",
    "finish": "matte|glossy|textured|paper-like",
    "description": "1-2 sentences on the overall impression"
  },
  "colorizationDirective": "A precise, technical directive (150-250 words) that an AI image editor MUST follow to reproduce this exact coloring style on any B&W coloring page. Structure as explicit rules: MEDIUM: [technique and texture]. PALETTE: [specific hex colors and relationships]. SHADING: [shadow and gradient approach]. FILL: [coverage and opacity rules]. HIGHLIGHTS: [how highlights are rendered]. EDGES: [how color meets outlines]. BACKGROUND: [background treatment]. MOOD: [overall feel and finish]. Be extremely specific. This directive controls the colorization output.",
  "tags": ["relevant", "lowercase", "tags"]
}

Rules:
- primaryColors: extract 4-6 dominant hex color values actually visible in the images
- accentColors: extract 2-3 accent/highlight hex colors
- For string fields: the pipe-separated values are SUGGESTIONS, not constraints. Use them if they fit, but write more precise descriptive values when appropriate (e.g. "watercolor with dry brush edges" instead of just "watercolor")
- colorizationDirective must be self-contained — usable without seeing the original images
- Focus on HOW colors are applied, not the subject matter or line art
- Return ONLY valid JSON, no markdown or explanation`;

/**
 * Build a colorization directive from structured coloring style properties.
 * Same pattern as buildDirectiveFromProperties but for coloring styles.
 */
export function buildColorizationDirective(style: {
  medium: { technique: string; texture: string; description: string };
  colorPalette: {
    primaryColors: string[];
    accentColors: string[];
    backgroundTone: string;
    warmth: string;
    saturation: string;
    description: string;
  };
  shadingAndLighting: {
    shadingStyle: string;
    lightDirection: string;
    highlightTreatment: string;
    shadowColorTendency: string;
    description: string;
  };
  fillBehavior: { edgeBleed: string; opacity: string; coverage: string; description: string };
  overallFeel: { mood: string; ageFeel: string; finish: string; description: string };
}): string {
  const parts = [
    `MEDIUM: ${style.medium.technique} technique with ${style.medium.texture} texture.`,
    `PALETTE: Primary colors ${style.colorPalette.primaryColors.join(", ") || "not specified"}, accents ${style.colorPalette.accentColors.join(", ") || "not specified"}. ${style.colorPalette.warmth} warmth, ${style.colorPalette.saturation} saturation.`,
    `SHADING: ${style.shadingAndLighting.shadingStyle} shading, light from ${style.shadingAndLighting.lightDirection}. Shadows tend toward ${style.shadingAndLighting.shadowColorTendency}.`,
    `HIGHLIGHTS: ${style.shadingAndLighting.highlightTreatment}.`,
    `FILL: ${style.fillBehavior.coverage} coverage, ${style.fillBehavior.opacity} opacity, ${style.fillBehavior.edgeBleed} at edges.`,
    `FINISH: ${style.overallFeel.finish} finish. Background tone: ${style.colorPalette.backgroundTone}.`,
    `MOOD: ${style.overallFeel.mood}, ${style.overallFeel.ageFeel} feel.`,
  ];
  if (style.medium.description) parts.push(style.medium.description);
  if (style.colorPalette.description) parts.push(style.colorPalette.description);
  if (style.shadingAndLighting.description) parts.push(style.shadingAndLighting.description);
  if (style.fillBehavior.description) parts.push(style.fillBehavior.description);
  if (style.overallFeel.description) parts.push(style.overallFeel.description);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
