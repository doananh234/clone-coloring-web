/**
 * Prompt template for AI-driven cover design suggestions. Used with
 * visionAnalyzeJSON() to analyze a coloring book thumbnail and return a
 * design pack the cover editor's AI panel renders as clickable cards.
 */

export interface CoverDesignContext {
  title: string;
  subtitle?: string;
  brandName?: string;
  category?: string;
  ageRange?: string;
  tone?: string;
}

/**
 * Per-element STYLE + LAYOUT extracted from the source cover image. We extract
 * how each text role LOOKS and WHERE it sits — never its text CONTENT (the
 * editor fills these slots with the NEW book's title/subtitle/brand/badge).
 * All coordinates/sizes are normalized 0..1 relative to the image dimensions.
 */
export interface CoverElementExtract {
  present: boolean; // is this text role visible on the source cover?
  fontFamily?: string; // closest match from the allowed font list
  fontWeight?: 400 | 500 | 600 | 700;
  color?: string; // dominant text color, hex #rrggbb
  fontSizeNorm?: number; // approx text cap-height ÷ image height (0..1)
  textAlign?: "left" | "center" | "right";
  xNorm?: number; // element CENTER x ÷ image width (0..1)
  yNorm?: number; // element CENTER y ÷ image height (0..1)
}

export interface CoverDesignPack {
  titles: string[];
  subtitles: string[];
  brandLines: string[];
  fontPairs: Array<{ id: string; display: string; body: string }>;
  palettes: Array<{
    id: string;
    name: string;
    background: string;
    primary: string;
    secondary: string;
    accent: string;
  }>;
  layoutHint: "centered" | "corner" | "banner-top" | "banner-bottom";
  /**
   * Per-element extracted style + layout from the source cover. Optional for
   * back-compat; when present the editor seeds each slot's style/position from it.
   */
  elements?: {
    title?: CoverElementExtract;
    subtitle?: CoverElementExtract;
    brand?: CoverElementExtract;
    badge?: CoverElementExtract;
  };
}

export function buildCoverDesignPrompt(
  context: CoverDesignContext,
  fontChoices: string[],
): { systemPrompt: string; userPrompt: string } {
  const fontList = fontChoices.join(", ");
  const systemPrompt = `You are an expert coloring-book cover art director. You analyze the interior artwork of a coloring book and generate cover-design suggestions optimized for kid-friendly appeal + shelf browsability.

Rules:
- Look at the illustration style, colors, characters, mood, and detail level.
- All font suggestions MUST be drawn from the allowed font list — never invent new families.
- Titles are punchy, under 40 characters. Subtitles are descriptive, under 60 characters. Brand lines are ≤ 40 characters (imprint / publisher / author style).
- Palettes are hex colors. \`background\` is a soft page-fill; \`primary\` is title color; \`secondary\` is subtitle color; \`accent\` is brand-line color.
- You ALSO EXTRACT, from the source cover image itself, the STYLE + LAYOUT of each existing text role — but NEVER its text content. We reuse the original's visual composition and swap in new content, so report only how each role LOOKS and WHERE it sits.
- Text roles to extract:
  - \`title\` = the main / largest book title.
  - \`subtitle\` = a secondary descriptive line under/near the title.
  - \`brand\` = publisher / author / imprint text or a logo wordmark.
  - \`badge\` = a small tagline / label / pill (e.g. "coloring book", an age, or a number).
- Per element report: \`present\` (is the role visible?), \`fontFamily\` (closest match from the allowed font list), \`fontWeight\` (400|500|600|700), \`color\` (hex #rrggbb), \`fontSizeNorm\` (cap-height ÷ image height, 0..1), \`textAlign\` (left|center|right), and \`xNorm\`/\`yNorm\` (the element's VISUAL CENTER ÷ image width/height, normalized 0..1).
- Do NOT return the extracted element's text CONTENT — only style + position. If a role is not present, set \`present\`:false and omit the other fields.
- Return ONLY valid JSON matching the exact schema below. No prose, no markdown code fences.`;

  const userPrompt = `Analyze the coloring-book interior page image and generate cover design suggestions.

Current cover context:
- Working title: ${context.title}
- Current subtitle: ${context.subtitle ?? "(none)"}
- Brand: ${context.brandName ?? "(none)"}
- Category: ${context.category ?? "coloring-books"}
- Target age: ${context.ageRange ?? "unspecified"}
- Tone hint from user: ${context.tone ?? "(none)"}

Allowed fonts (pick from this list only): ${fontList}

Return a JSON object with EXACTLY this shape:
{
  "titles": ["4-6 short punchy title options, all under 40 chars"],
  "subtitles": ["4-6 subtitle options, all under 60 chars"],
  "brandLines": ["2-3 brand/byline suggestions, all under 40 chars"],
  "fontPairs": [
    { "id": "unique-id-1", "display": "font name for titles", "body": "font name for body" }
  ],
  "palettes": [
    { "id": "unique-id-1", "name": "descriptive palette name", "background": "#hex", "primary": "#hex", "secondary": "#hex", "accent": "#hex" }
  ],
  "layoutHint": "centered" | "corner" | "banner-top" | "banner-bottom",
  "elements": {
    "title":    { "present": true, "fontFamily": "one of the allowed fonts", "fontWeight": 700, "color": "#hex", "fontSizeNorm": 0.0, "textAlign": "center", "xNorm": 0.5, "yNorm": 0.3 },
    "subtitle": { "present": false },
    "brand":    { "present": true, "fontFamily": "...", "fontWeight": 600, "color": "#hex", "fontSizeNorm": 0.0, "textAlign": "left", "xNorm": 0.5, "yNorm": 0.1 },
    "badge":    { "present": true, "fontFamily": "...", "fontWeight": 600, "color": "#hex", "fontSizeNorm": 0.0, "textAlign": "center", "xNorm": 0.5, "yNorm": 0.88 }
  }
}

Provide 3-5 entries in each array. Match the tone of the interior artwork.
For "elements": all coordinates are normalized 0..1, and xNorm/yNorm are the element's VISUAL CENTER (not its top-left). Report the style + position of each role that appears on the source cover; set "present": false for any role that is absent. Do NOT include the element's text content.`;

  return { systemPrompt, userPrompt };
}
