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
  "layoutHint": "centered" | "corner" | "banner-top" | "banner-bottom"
}

Provide 3-5 entries in each array. Match the tone of the interior artwork.`;

  return { systemPrompt, userPrompt };
}
