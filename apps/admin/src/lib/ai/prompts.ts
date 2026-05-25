/**
 * Prompt Templates — centralized prompt management.
 * All AI prompts in one place for easy editing and versioning.
 */

// --- Character & Location Extraction ---

export const EXTRACTION_PROMPT = `Analyze this coloring book page image. Extract ALL characters and locations/scenes visible.

Return a JSON object with this exact structure:
{
  "characters": [
    {
      "name": "descriptive name (e.g. Lion with Crown)",
      "type": "animal|character|person|object",
      "role": "main_character|supporting|background",
      "visualDna": {
        "shapeLanguage": "description of shapes and forms",
        "proportions": "size and body proportions",
        "outlineStyle": "line art style",
        "style": "mandala|kawaii|realistic|cartoon|zentangle",
        "colorPalette": ["noted colors if any, or empty for B&W"],
        "facialFeatures": "face description",
        "accessories": ["list of accessories"],
        "distinguishingFeatures": ["unique identifying features"]
      },
      "characterPrompt": "A detailed prompt to recreate ONLY this character as an isolated figure on white background, black and white line art coloring book style. Be very specific about every visual detail.",
      "tags": ["relevant", "tags"]
    }
  ],
  "locations": [
    {
      "name": "descriptive name (e.g. Enchanted Forest)",
      "description": "narrative description of the location",
      "visualDescription": "detailed visual description for image generation",
      "locationPrompt": "A detailed prompt to recreate this location/scene as a coloring book background, black and white line art, no characters, just the environment.",
      "atmosphere": {
        "weather": "weather condition or empty",
        "lighting": "lighting description",
        "timeOfDay": "time of day or empty",
        "mood": "overall mood"
      },
      "props": ["key objects in the scene"],
      "tags": ["relevant", "tags"]
    }
  ]
}

Rules:
- Extract EVERY distinct character, even small background ones
- For locations, describe the overall scene/environment separately from characters
- characterPrompt and locationPrompt must be self-contained — usable to generate a new image without seeing the original
- If the image is mostly a character with minimal background, locations array can be empty
- Tags should be lowercase, useful for search
- Return ONLY valid JSON, no markdown or explanation`;

// --- Book Subtitle Generation ---

export function buildSubtitlePrompt(title: string, description?: string): string {
  return `Generate a short, catchy subtitle (under 10 words) for a coloring book titled "${title}"${description ? `. Description: ${description}` : ""}. Return only the subtitle text, no quotes.`;
}

// --- Coloring Page Prompt Generation ---

export function buildColoringPagePrompt(subject: string, style?: string): string {
  const styleHint = style || "detailed black and white line art";
  return `${subject}, ${styleHint}, coloring book page, clean outlines, no shading, no color fill, white background, suitable for coloring`;
}

// --- Auto-generate Page Prompts from Title ---

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

// --- Combine Character + Location into Page Prompt ---

export function buildCombinedPagePrompt(characterPrompt: string, locationPrompt?: string): string {
  if (locationPrompt) {
    return `${characterPrompt}, set in ${locationPrompt}, black and white coloring book page, clean outlines, no shading, white background`;
  }
  return `${characterPrompt}, black and white coloring book page, clean outlines, no shading, white background`;
}

// --- Story Outline Generation ---

export function buildStoryOutlinePrompt(params: {
  title: string;
  description?: string;
  pageCount: number;
  characters: { name: string; characterPrompt: string }[];
  locations: { name: string; locationPrompt: string }[];
  style: string;
}): string {
  const { title, description, pageCount, characters, locations, style } = params;

  const charList =
    characters.length > 0
      ? characters.map((c) => `- ${c.name}: ${c.characterPrompt}`).join("\n")
      : "No characters provided — invent 2-3 characters that fit the title.";

  const locList =
    locations.length > 0
      ? locations.map((l) => `- ${l.name}: ${l.locationPrompt}`).join("\n")
      : "No locations provided — invent 3-4 locations that fit the title.";

  return `You are a coloring book story planner. Generate a ${pageCount}-page story outline for a coloring book titled "${title}".${description ? ` Description: ${description}` : ""}

Art style: ${style}

CHARACTERS:
${charList}

LOCATIONS:
${locList}

RULES (you MUST follow ALL of these):

1. LOCATION MODIFIERS: Each scene visit to a base location MUST have a unique modifier. Use combinations of:
   - Time: dawn, morning, noon, afternoon, dusk, night, midnight
   - Weather: sunny, cloudy, rainy, snowy, windy, stormy, foggy, misty
   - Season: spring blossoms, summer heat, autumn leaves, winter frost
   - Event: festival, discovery, storm passing, celebration, secret revealed
   You can combine or invent new modifiers. Same base location must NEVER look the same twice.

2. SCENE ELEMENTS: Each scene MUST have 3-5 small unique physical props/details. Examples:
   - Natural: fallen log, mushroom cluster, wildflowers, bird nest, stepping stones, vines
   - Man-made: lantern, wooden sign, rope bridge, old well, treehouse, fence
   - Magical: glowing crystals, floating orbs, enchanted mirror, portal, treasure chest
   - Interactive: picnic blanket, fishing rod, campfire, kite, musical instrument
   Scene elements MUST be different for every visit to the same base location.

3. CHARACTER GROUPINGS: Vary across pages:
   - ~30% solo character scenes
   - ~40% pair/small group scenes
   - ~30% full group scenes
   - Never same exact grouping 2 pages in a row

4. ACTIVITY VARIATION: Every page MUST have a different activity. Never repeat.
   Examples: exploring, playing, eating, sleeping, discovering, building, flying, swimming, climbing, hiding, celebrating, reading, cooking, gardening, painting, dancing, fishing, running, singing, crafting

5. STORY ARC: Distribute scenes across acts:
   - Intro (first 20%): characters introduced, calm mood
   - Adventure (next 40%): exploration, discovery, increasing complexity
   - Climax (next 20%): challenge, dramatic scenes, peak energy
   - Resolution (final 20%): peaceful conclusion, celebration, rest

6. COMPOSITION VARIETY: Alternate between:
   - Wide/establishing shots
   - Medium shots (character + environment)
   - Close-up character portraits
   - Overhead/bird's eye views
   - Low angle dramatic views

Return a JSON object:
{
  "scenes": [
    {
      "sceneNumber": 1,
      "locationName": "location name from list above",
      "locationModifier": "unique modifier for this visit",
      "sceneElements": ["prop1", "prop2", "prop3", "prop4"],
      "characterNames": ["char1"],
      "activity": "specific activity description",
      "mood": "emotional mood",
      "composition": "shot type and framing"
    }
  ]
}

Return ONLY valid JSON. Generate exactly ${pageCount} scenes.`;
}

// --- Art Style Extraction ---

export const ART_STYLE_EXTRACTION_PROMPT = `Analyze the art style of these coloring book pages. Extract detailed visual properties that define this specific style.

Return a JSON object with this exact structure:
{
  "name": "suggested style name (e.g. Kawaii Bear Studio, Bold Mandala, Sketchy Woodland)",
  "description": "one-paragraph summary of the overall art style",
  "lineWork": {
    "strokeWeight": "<number in px — estimate the outline thickness at 1024x1024 resolution, e.g. 0.5=hairline, 1.5=thin, 2.5=medium, 4=bold, 6=extra bold>",
    "lineQuality": "clean|sketchy|rough|organic",
    "lineVariation": "uniform|tapered|calligraphic",
    "outlineStyle": "single|double|broken|none",
    "hatchingPattern": "none|crosshatch|stipple|parallel",
    "description": "1-2 sentences capturing line work nuances the enums can't express"
  },
  "composition": {
    "density": "sparse|moderate|dense|intricate",
    "symmetry": "symmetric|asymmetric|radial|freeform",
    "framingStyle": "full-page|vignette|bordered|floating",
    "negativeSpace": "generous|balanced|minimal",
    "focalPoint": "centered|rule-of-thirds|scattered|layered",
    "description": "1-2 sentences on composition nuances"
  },
  "formAndShape": {
    "shapeLanguage": "geometric|organic|mixed|angular",
    "edgeTreatment": "sharp|rounded|soft|mixed",
    "proportionStyle": "realistic|exaggerated|chibi|stylized",
    "detailLevel": "minimal|moderate|intricate|hyper-detailed",
    "description": "1-2 sentences on form nuances"
  },
  "moodAndAtmosphere": {
    "mood": "a specific mood word (e.g. playful, serene, whimsical, dreamy)",
    "energyLevel": "calm|moderate|dynamic|chaotic",
    "ageTarget": "toddler|kids|teen|adult|all-ages",
    "themeCategory": "a theme word (e.g. nature, fantasy, everyday, animals)",
    "description": "1-2 sentences on mood nuances"
  },
  "patternAndTexture": {
    "fillPattern": "none|zentangle|mandala|crosshatch|dots|mixed",
    "backgroundTreatment": "blank|simple|detailed|patterned",
    "decorativeElements": "none|minimal|moderate|ornate",
    "borderStyle": "none|simple|decorative|themed",
    "description": "1-2 sentences on pattern nuances"
  },
  "technical": {
    "orientation": "portrait|landscape|square",
    "complexityScore": "<integer 1-10, estimate how complex the page is to color>",
    "estimatedColoringTime": "5-15min|15-30min|30-60min|60min+",
    "description": "1-2 sentences on technical aspects"
  },
  "generationDirective": "A precise, technical directive (150-250 words) that an AI image generator MUST follow to reproduce this exact style. Structure it as explicit rules, not descriptions. Example format: 'OUTLINE: Use exactly Xpx uniform black outlines with [rounded/flat] endpoints. INTERIOR LINES: [describe exactly how inner details are drawn — single lines, double lines, none, dashed, etc.]. CURVES: [tight/loose/mixed] curve tension, corners are [sharp/rounded Xpx radius/beveled]. SPACING: minimum Xpx gap between elements, [crowded/airy] composition. FILLS: [none/crosshatch at X angle/stipple dots at X density]. SHAPES: [round/angular/mixed], [exaggerated/realistic] proportions. CHARACTER STYLE: [chibi/realistic/cartoon] with [large head/normal/small head] ratio. DETAILS: [minimal interior detail/moderate/heavily decorated]. WEIGHT HIERARCHY: main outlines Xpx, secondary details Xpx, decorative elements Xpx.' Be extremely specific with numbers and measurements. This directive controls the output style.",
  "tags": ["relevant", "lowercase", "tags"]
}

Rules:
- strokeWeight must be a number in px (e.g. 0.5 for hairline, 1.5 for thin, 2.5 for medium, 4 for bold, 6 for extra bold). Estimate based on the apparent line thickness at 1024x1024 resolution.
- For string fields: the pipe-separated values shown above are SUGGESTIONS, not constraints. Use them if they fit, but if the style has a more precise or nuanced characteristic, write a specific descriptive value instead (e.g. "clean with slight wobble" instead of just "clean", or "tight geometric with rounded terminals" instead of just "geometric").
- complexityScore must be 1-10 integer
- generationDirective must be self-contained — usable without seeing the original images
- Focus on reproducibility: what makes this style THIS style and not another
- Return ONLY valid JSON, no markdown or explanation`;

export function buildDirectiveFromProperties(style: {
  lineWork: {
    strokeWeight: number | string;
    lineQuality: string;
    lineVariation: string;
    outlineStyle: string;
    hatchingPattern: string;
    description: string;
  };
  composition: { density: string; negativeSpace: string; description: string };
  formAndShape: {
    shapeLanguage: string;
    edgeTreatment: string;
    proportionStyle: string;
    detailLevel: string;
    description: string;
  };
  moodAndAtmosphere: { mood: string; energyLevel: string; description: string };
  patternAndTexture: { fillPattern: string; backgroundTreatment: string; description: string };
}): string {
  const parts = [
    `OUTLINE: Use exactly ${style.lineWork.strokeWeight}px ${style.lineWork.lineQuality} black outlines, ${style.lineWork.lineVariation} stroke variation, ${style.lineWork.outlineStyle} outline style.`,
    `INTERIOR LINES: ${style.lineWork.hatchingPattern !== "none" ? `Use ${style.lineWork.hatchingPattern} hatching for shading areas.` : "No hatching or fill inside shapes."}`,
    `SHAPES: ${style.formAndShape.shapeLanguage} shapes with ${style.formAndShape.edgeTreatment} edges.`,
    `CHARACTER STYLE: ${style.formAndShape.proportionStyle} proportions, ${style.formAndShape.detailLevel} detail level.`,
    `SPACING: ${style.composition.density} element density, ${style.composition.negativeSpace} negative space.`,
    `FILLS: ${style.patternAndTexture.fillPattern !== "none" ? style.patternAndTexture.fillPattern : "none — leave shapes empty for coloring"}.`,
    `BACKGROUND: ${style.patternAndTexture.backgroundTreatment}.`,
    `MOOD: ${style.moodAndAtmosphere.mood}, ${style.moodAndAtmosphere.energyLevel} energy.`,
  ];
  if (style.lineWork.description) parts.push(style.lineWork.description);
  if (style.formAndShape.description) parts.push(style.formAndShape.description);
  if (style.moodAndAtmosphere.description) parts.push(style.moodAndAtmosphere.description);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

// --- Coloring Style Extraction ---

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
