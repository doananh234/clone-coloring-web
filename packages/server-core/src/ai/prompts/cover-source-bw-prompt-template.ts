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
 * TOP button — premium square coloring-book cover built as three vertical
 * regions: a title+subtitle band (top 28%), a breathing gap (28–32%), and the
 * original artwork kept large below (32–100%), borderless, pure B&W line art,
 * with sparse organic decoration around/below the future title. Static (no
 * per-call interpolation).
 */
const TOP_COVER_PROMPT = `You are a professional coloring-book cover designer.

Transform the FIRST PROVIDED IMAGE into a premium STRICTLY 1:1 square coloring-book cover.

The FIRST PROVIDED IMAGE is the PRIMARY SOURCE OF TRUTH.

This is a RECOMPOSITION task, NOT a redesign.

Preserve the original illustration as faithfully as possible.

==================================================
CRITICAL CANVAS LAYOUT
==================================================

The final canvas MUST be exactly 1:1 square.

Divide the canvas into three clear vertical regions:

TOP 0–28%:
DEDICATED TITLE + SUBTITLE REGION

28–32%:
NATURAL BREATHING SPACE

32–100%:
MAIN ORIGINAL ILLUSTRATION REGION

THIS SPATIAL STRUCTURE IS CRITICAL.

The MAIN ORIGINAL ILLUSTRATION MUST NOT ENTER THE TOP 28% TITLE REGION.

The top 28% must remain visually available for future TITLE and SUBTITLE placement.

Do NOT move the original illustration upward to fill the title region.

Do NOT allow any major original object to enter the title region.

The balloon, characters, animals, vehicle, building, basket, clouds belonging to the main scene, or any other major original subject MUST remain below the title region.

If necessary, make the original illustration slightly smaller to preserve this layout.

==================================================
TITLE REGION
==================================================

Reserve the upper portion of the canvas specifically for future typography.

The future layout is:

             TITLE

        small decoration

            SUBTITLE

The TITLE will be added later by an editor.

The SUBTITLE will be added later by an editor.

Do NOT generate any text.

Do NOT generate placeholder text.

Do NOT generate letters.

Do NOT generate typography.

The actual future TITLE placement area must remain completely empty.

The actual future SUBTITLE placement area must remain completely empty.

Both areas must have clean white background.

==================================================
DECORATION AROUND TITLE
==================================================

The title region should NOT look like a completely empty rectangular white block.

A FEW small, lightweight, context-aware decorative motifs may appear around the typography.

Decorations may appear:

- near the upper-left of the title
- near the upper-right of the title
- beside the title
- immediately below the title
- between the title and subtitle
- beside the subtitle
- near the lower edges of the typography region

This is intentional.

Small decorative motifs MAY appear immediately below the future TITLE and in the whitespace between TITLE and SUBTITLE.

They should look like small floating thematic accents.

Use only a FEW motifs.

Keep them:

- small
- sparse
- lightweight
- irregular
- asymmetrical
- organically positioned
- visually secondary

The actual TITLE and SUBTITLE placement areas must remain unobstructed.

Do NOT place decorations directly behind the future text.

Do NOT allow decorations to overlap the future text.

Do NOT create an underline.

Do NOT create a divider.

Do NOT create a decorative banner.

Do NOT create a frame.

Do NOT create a decorative ceiling.

Do NOT create a repetitive pattern.

The correct concept is:

CLEAN TEXT AREAS
+
SMALL ORGANIC DECORATION AROUND THEM

==================================================
BREATHING SPACE
==================================================

Between the typography region and the main illustration, maintain a MODERATE NATURAL WHITE BREATHING SPACE.

Do not make this gap excessively large.

Do not allow the illustration to creep upward into the typography region.

The main illustration should begin naturally around the 32% vertical position.

==================================================
MAIN ORIGINAL ILLUSTRATION
==================================================

Preserve the FIRST PROVIDED IMAGE's original illustration as faithfully as possible.

Preserve:

- characters
- animals
- objects
- poses
- gestures
- facial expressions
- proportions
- relative scale
- important details
- line-art style
- visual identity
- thematic identity

Do NOT redesign the original scene.

Do NOT replace characters.

Do NOT invent new major objects.

Do NOT substantially change the composition.

Do NOT change character identity.

Do NOT change poses or expressions.

The result must remain immediately recognizable as the SAME ORIGINAL ILLUSTRATION.

==================================================
ARTWORK SIZE
==================================================

The original illustration should be LARGE and visually dominant within the LOWER ARTWORK REGION.

Do NOT make the artwork small.

Do NOT center a small isolated illustration.

Do NOT create excessive side margins.

Within the lower artwork region, maximize the illustration's horizontal width.

The illustration should extend very close to both the LEFT and RIGHT canvas edges where physically possible.

Keep only a tiny white safety gap.

Do NOT crop important objects.

Do NOT clip important elements.

IMPORTANT:

MAXIMIZE THE ARTWORK ONLY WITHIN THE LOWER ARTWORK REGION.

NEVER enlarge the artwork upward into the title region.

==================================================
BOTTOM EDGE
==================================================

Push the lower artwork toward the bottom edge.

Target approximately 5px of white margin at the bottom.

Do NOT create a large bottom margin.

==================================================
SOURCE BORDER
==================================================

If the original image contains a border, frame, rounded rectangle, perimeter outline, or enclosing frame:

REMOVE IT COMPLETELY.

Do NOT preserve it.

Do NOT replace it.

Do NOT create a new border.

==================================================
DECORATION STYLE
==================================================

Derive decorative motifs from the original illustration's:

- environment
- season
- weather
- activity
- atmosphere
- subject matter
- visual theme

Use only simple BLACK LINE-ART motifs.

No unrelated decorative objects.

No large new illustrations.

No color.

No gray.

No shading.

No gradients.

No shadows.

No texture.

==================================================
OPEN BORDERLESS DESIGN
==================================================

The final cover must have NO:

- border
- frame
- perimeter line
- decorative frame
- corner frame
- enclosing outline
- panel
- box
- banner
- ribbon
- divider
- separator

The composition must remain open and borderless.

==================================================
FINAL COMPOSITION PRIORITY
==================================================

Follow this priority order:

1. STRICTLY preserve the original illustration.
2. STRICTLY preserve the TOP 28% typography region.
3. Keep the TITLE placement area empty.
4. Keep the SUBTITLE placement area empty.
5. Allow a FEW small decorative motifs around and immediately below the TITLE.
6. Allow a FEW small decorative motifs between TITLE and SUBTITLE.
7. Maintain natural breathing space below the SUBTITLE.
8. Place the original illustration beginning below approximately 32% of the canvas height.
9. Make the original illustration as large as possible ONLY within the lower region.
10. Maximize left/right artwork coverage within that lower region.
11. Minimize the bottom margin.
12. Keep decoration sparse and organic.
13. Keep the entire composition borderless.
14. Never generate text.

==================================================
FINAL VISUAL CHECK
==================================================

Before generating, verify:

- Exactly 1:1 square.
- TOP 28% is reserved for TITLE + SUBTITLE.
- No major original artwork enters the TOP 28%.
- TITLE placement area is clean white space.
- SUBTITLE placement area is clean white space.
- Small decorative motifs may appear around the title.
- Small decorative motifs may appear immediately below the title.
- Small decorative motifs may appear between title and subtitle.
- Decorations do not overlap future text.
- Main illustration begins BELOW the typography region.
- Main illustration occupies approximately the lower 68% of the canvas.
- Main illustration is large.
- Main illustration reaches very close to left and right edges.
- Bottom margin is extremely small.
- Original illustration remains recognizable.
- Source border is removed.
- No new border or frame is created.
- No text is generated.
- No color.
- No gray.
- No shading.
- No gradients.
- No repetitive decorative pattern.

Generate ONE strictly 1:1 square coloring-book cover.`;

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
