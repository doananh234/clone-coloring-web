/**
 * B&W Cover-Source Prompt — recompose an interior coloring page into a
 * book-cover LAYOUT while staying PURE BLACK-AND-WHITE LINE ART. Unlike
 * buildCoverSourcePrompt, this NEVER colorizes.
 *
 * - "top": premium 1:1 square cover prompt with a protected TOP title/subtitle
 *   band (TOP_COVER_PROMPT below) — three-region vertical layout, tuned
 *   separately.
 * - "middle" / "bottom": the shared recompose template that reserves a 25%
 *   title-safe band (middle band / lower band) with the illustration in the
 *   remaining 75%.
 */
type TitleSafePosition = "top" | "middle" | "bottom";

/**
 * TOP button — premium square coloring-book cover: an airy, text-free
 * title-safe area across the top ~30% (open sky + sparse motifs), the original
 * artwork kept large below, borderless, pure B&W line art. Deliberately does
 * NOT spell out a "TITLE / SUBTITLE" mockup — image models render those as
 * literal words — and forbids all lettering outright. Static (no per-call
 * interpolation).
 */
const TOP_COVER_PROMPT = `You are a professional coloring-book cover designer working in pure black-and-white line art.

Transform the FIRST PROVIDED IMAGE into a premium, STRICTLY 1:1 square coloring-book cover. The FIRST PROVIDED IMAGE is the PRIMARY SOURCE OF TRUTH. This is a RECOMPOSITION task, NOT a redesign: keep the original scene, characters, objects, poses, proportions and line style faithfully recognizable.

==================================================
ABSOLUTELY NO TEXT — HIGHEST PRIORITY
==================================================

Render ZERO text of any kind. Do NOT draw letters, words, characters, numbers, typography, captions, labels, headings, watermarks, or any placeholder wording. In particular, do NOT write the words "TITLE" or "SUBTITLE" — never render them as letters.

The upper area is left open ONLY so a human editor can drop in a title later. You must leave it as clean line art (open background + sparse motifs), NEVER as written text. If you are ever about to draw a letterform, stop and leave that space empty instead. The finished image must contain no readable text anywhere.

==================================================
CANVAS + LAYOUT — RESERVE THE TOP (CRITICAL)
==================================================

Final canvas: exactly 1:1 square, pure white background. Split it into two zones:

• TOP 30% = TITLE-SAFE ZONE. This band MUST stay open and airy — only open sky / plain white background plus a few small sparse motifs. NO part of any major subject may enter it: the hot-air balloon (INCLUDING the very top of the balloon), the basket, characters, animals, vehicle or building must ALL sit BELOW this band. The highest point of the main illustration must land at or below the 30% line, leaving clear headroom above it.

• LOWER 70% = ARTWORK ZONE. The main illustration lives here.

To achieve this, SHIFT the whole illustration DOWNWARD and, if needed, SCALE IT DOWN so nothing crosses up into the top 30%. It is REQUIRED to leave clear open space at the top for a title to be added later. Do NOT let the balloon, clouds, or any element rise to the top edge of the canvas.

The transition between the open top and the artwork must be soft and natural — no hard dividing line, no stark empty white rectangle. The top simply reads as calm open sky.

COMMON MISTAKE TO AVOID: filling the entire canvas top-to-bottom with the balloon so it touches the top edge. That is WRONG — the top 30% must visibly stay open.

==================================================
MAIN ILLUSTRATION — PRESERVE FAITHFULLY
==================================================

Preserve the original illustration: characters, animals, objects, poses, gestures, facial expressions, proportions, relative scale, important details, line weight, and overall style. Do NOT replace characters, invent new major objects, or change the scene. It must remain immediately recognizable as the SAME original illustration.

Make it large and dominant within the lower region: extend the artwork close to the LEFT and RIGHT edges (tiny white safety gap only) and close to the BOTTOM edge (small bottom margin, ~5px). Do NOT crop or clip important elements to gain width.

==================================================
DECORATION
==================================================

Scatter a FEW small, sparse, context-aware BLACK LINE-ART motifs derived from the original scene — e.g. clouds, stars, flowers, hearts, sparkles, a crescent moon, small thematic objects — across the open areas, including the upper title-safe area and around the illustration. Keep them small, lightweight, irregular, asymmetrical, and visually secondary.

Do NOT form patterns, rows, columns, grids, or symmetrical arrangements. Do NOT create a decorative ceiling, an underline, a divider, a banner, a ribbon, a frame, or a border. The composition stays open and borderless.

==================================================
STYLE
==================================================

Pure black line art on clean white. NO color, NO gray, NO shading, NO gradients, NO shadows, NO cross-hatching, NO texture, NO filled areas. If the source has an outer border, frame, or rounded-rectangle enclosure, REMOVE it completely and do not add a new one.

==================================================
FINAL OUTPUT
==================================================

Generate ONE strictly 1:1 square black-and-white coloring-book cover: a faithful recomposition of the original scene, with a clean airy TEXT-FREE title-safe area kept open across the TOP 30% (open sky + a few sparse motifs, with the balloon and every major subject sitting BELOW it), the artwork filling the lower 70% and reaching close to the left, right, and bottom edges, sparse on-theme decoration, borderless — and absolutely no letters, words, or a "TITLE"/"SUBTITLE" mockup anywhere.`;

function regionClauses(titleSafe: TitleSafePosition): { safe: string; art: string } {
  switch (titleSafe) {
    case "top":
      return { safe: "the UPPER 25% of the canvas", art: "the lower 75% of the canvas" };
    case "bottom":
      return { safe: "the LOWER 25% of the canvas", art: "the upper 75% of the canvas" };
    case "middle":
      return {
        safe: "a horizontal band across the MIDDLE ~25% of the canvas",
        art: "the remaining ~75% split above and below that middle band",
      };
  }
}

export function buildCoverSourceBWPrompt(titleSafe: TitleSafePosition): string {
  // TOP uses the dedicated premium square-cover prompt (tuned separately).
  if (titleSafe === "top") return TOP_COVER_PROMPT;

  const { safe, art } = regionClauses(titleSafe);
  return `You are a professional coloring-book cover designer working in pure black-and-white line art.

TASK:
Recompose the FIRST provided image (a black-and-white coloring page) into a book-cover LAYOUT. Preserve the original subjects, characters, objects, concept, and line-art style. Reposition so the MAIN ILLUSTRATION occupies ${art}, and reserve ${safe} as a clean, title-safe area for a title to be added LATER.

==================================================
STAY PURE BLACK-AND-WHITE LINE ART
==================================================

- Output MUST be pure black-and-white line art: clean black outlines on a white background.
- NO color. Do not color or colour anything.
- NO grayscale, NO gray shading, NO gradients, NO filled areas, NO tonal rendering.
- Keep the exact same line weight, shape language, and stroke quality as the original drawing.

==================================================
PRESERVE THE ORIGINAL ARTWORK
==================================================

Keep the original main subject(s), characters, objects, concept, mood, and line-art style. Do NOT switch to a new scene, invent large new characters, or remove important details. The goal is to RE-COMPOSE the page into a cover layout, not to draw a new picture.

==================================================
TITLE-SAFE AREA (25%)
==================================================

Reserve ${safe} as a title-safe area for a title/subtitle to be placed LATER (do NOT draw any text now). It must be airy and open — free of the main subject, large objects, and dense detail — but NOT completely empty: scatter SPARSE, small black-and-white line-art motifs drawn from the original's own decorative elements (e.g. stars, leaves, dots, hearts, sparkles) at low density. The transition to the illustration must be natural — no hard dividing line.

==================================================
MAIN ILLUSTRATION (75%)
==================================================

Keep the main illustration in ${art}: large enough to read as a thumbnail, do not crop out the character or important objects, keep the rich detail of the source. You MAY gently reposition, rescale, or lightly outpaint the background to fit the cover layout, but everything you add must match the original's line weight and style.

==================================================
DO NOT GENERATE
==================================================

- any text: title, subtitle, author name, logo, brand, fake typography, random letters, or watermark
- any color, grayscale shading, gradients, or filled/painted areas
- a collage, grid, or multi-panel layout
- a completely empty title area, or a hard horizontal divider

==================================================
FINAL OUTPUT
==================================================

A single black-and-white line-art COVER SOURCE: the original illustration re-composed for a cover, main artwork in ${art}, a clean title-safe area in ${safe} holding only sparse on-brand line-art motifs, and NO text anywhere.`;
}
