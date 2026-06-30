/**
 * Art Style Prompts — extraction and directive building for art styles.
 */

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
