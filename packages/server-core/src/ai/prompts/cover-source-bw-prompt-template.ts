/**
 * B&W Cover-Source Prompt — recompose an interior coloring page into a
 * book-cover LAYOUT while staying PURE BLACK-AND-WHITE LINE ART. Unlike
 * buildCoverSourcePrompt, this NEVER colorizes.
 *
 * - "top": premium 1:1 square cover prompt with a protected TOP-CENTER
 *   title/subtitle zone (TOP_COVER_PROMPT below) — tuned separately.
 * - "middle" / "bottom": the shared recompose template that reserves a 25%
 *   title-safe band (middle band / lower band) with the illustration in the
 *   remaining 75%.
 */
type TitleSafePosition = "top" | "middle" | "bottom";

/**
 * TOP button — premium square coloring-book cover with a large, clean
 * TOP-CENTER title + subtitle zone, the original artwork kept large below,
 * borderless, pure B&W line art. Static (no per-call interpolation).
 */
const TOP_COVER_PROMPT = `You are a professional coloring-book cover designer specializing in premium square coloring-book covers, clean black-and-white line art, and faithful image recomposition.

Transform the FIRST PROVIDED IMAGE into a premium STRICTLY 1:1 square coloring-book cover. The FIRST PROVIDED IMAGE is the PRIMARY SOURCE OF TRUTH. This is a RECOMPOSITION task, NOT a redesign. Preserve the original illustration as faithfully as possible.

==================================================
CORE DESIGN GOAL
==================================================

Create a professional square coloring-book cover with:
1. A LARGE, CLEAN, EMPTY TITLE + SUBTITLE AREA at the TOP CENTER.
2. The ORIGINAL ILLUSTRATION kept as LARGE as practically possible below it.
3. Extremely narrow left and right margins around the artwork.
4. A very small bottom margin.
5. Sparse, context-aware decorative motifs distributed naturally around the composition.
6. NO border and NO frame.

The most important visual balance is: LARGE TITLE SPACE + LARGE ORIGINAL ARTWORK

Do NOT sacrifice the title space in order to enlarge the artwork. Do NOT sacrifice the artwork by shrinking it excessively. The composition should feel intentionally designed, natural, organic, and professionally balanced rather than mechanically divided into separate sections.

==================================================
PROTECTED TITLE + SUBTITLE ZONE — CRITICAL
==================================================

Reserve approximately the TOP 30% of the square canvas primarily as a protected typography zone. This is the future placement area for: TITLE SUBTITLE. Both will be added later by an editor. The TITLE will be placed at the TOP CENTER. The SUBTITLE will be centered directly below the TITLE.

The CENTRAL TYPOGRAPHY AREA must remain clean, open, calm, and predominantly empty. The actual future text placement area must remain unobstructed.

IMPORTANT: The main illustration MUST NOT enter the central title/subtitle placement area. No major original object may extend behind or through the central title area. Do NOT allow the balloon, house, animal, character, vehicle, building, or any other major subject from the original illustration to enter the central typography area. The title and subtitle must have enough uninterrupted space for comfortable future text placement. When uncertain, PRIORITIZE MORE EMPTY CENTRAL TITLE SPACE rather than pushing the artwork upward.

==================================================
TITLE ZONE — ORGANIC PERIMETER DECORATION
==================================================

The title zone should NOT look like an isolated blank rectangle. The CENTRAL TYPOGRAPHY AREA must remain clean and unobstructed, but the OUTER PERIMETER of the title/subtitle whitespace may contain a FEW small, lightweight, context-aware decorative motifs.

Think: CLEAN CENTER + ORGANIC DECORATION AROUND THE EDGES
NOT: COMPLETELY EMPTY TOP AREA

Small decorative motifs MAY subtly overlap the OUTER EDGES of the title/subtitle zone. They may partially intrude into the surrounding whitespace in a natural way. This is encouraged when it improves the visual integration of the cover.

However:
- Never place a decoration directly behind the future title.
- Never place a decoration directly behind the future subtitle.
- Never place a large motif underneath the future title.
- Never allow decoration to visually compete with the future text.
- Never obstruct the actual title or subtitle placement area.
- Never fill the central typography area with decoration.

The title area should remain PREDOMINANTLY WHITE and visually calm, while its outer edges can contain subtle decorative accents. Decorations should feel organically connected to the composition rather than artificially separated from the title area.

==================================================
TITLE ZONE VISUAL STRUCTURE
==================================================

The top-center area should visually read approximately as:

small decoration [ TITLE ] [ SUBTITLE ] small decoration small decoration

The exact placement must remain organic and asymmetric. The central TITLE + SUBTITLE placement area must remain clean. Small decorative elements may exist around the PERIPHERY of this whitespace.

Do NOT generate any text. Do NOT generate placeholder text. Do NOT generate letters. Do NOT generate typography. Do NOT generate fake title text. The entire central text placement area must remain completely text-free.

==================================================
DECORATION RULE
==================================================

Decorations ARE allowed throughout the cover. They MUST be derived from the actual visual theme of the original illustration. Analyze the original illustration and infer:
- environment
- season
- weather
- time of day
- activity
- atmosphere
- subject matter
- visual theme

Use only simple, small, black line-art motifs. Decorations should be:
- sparse
- small
- lightweight
- subtle
- organically positioned
- irregularly distributed
- varied in scale
- visually integrated with the original illustration

Decorations may appear in:
- outer upper-left area
- outer upper-right area
- peripheral areas of the title zone
- side areas
- open spaces between major artwork elements
- lower-left open spaces
- lower-right open spaces
- transition areas around the artwork

A FEW very small decorative motifs may subtly overlap the outer edges of the title/subtitle whitespace. This peripheral overlap is desirable when it creates a more natural composition. However, decorations must NEVER dominate the title zone.

==================================================
DECORATION COMPOSITION
==================================================

Avoid mechanical decoration placement. Do NOT create:
- repetitive patterns
- rows
- columns
- grids
- symmetrical decorative arrangements
- decorative borders
- corner frames
- decorative ceilings
- large secondary illustrations
- enclosing compositions

Do NOT surround the title with a frame. Do NOT create a decorative arch above the title. Do NOT create a decorative banner behind the title. Do NOT create a decorative panel around the title. Do NOT fill the upper area with decorative objects.

Use only a FEW carefully placed accents. The decoration should feel incidental, natural, and context-aware. Some motifs can partially enter the surrounding whitespace near the title, but the central typography area must remain visually quiet.

==================================================
MAIN ILLUSTRATION
==================================================

Preserve the original illustration as faithfully as possible. Preserve:
- original characters
- original animals
- original objects
- original subjects
- facial expressions
- poses
- gestures
- proportions
- relative scale
- important details
- line-art style
- line weight
- visual identity
- thematic identity

Do NOT redesign the original illustration. Do NOT replace characters. Do NOT invent new major objects. Do NOT substantially alter the scene. Do NOT change character identity. Do NOT change poses. Do NOT change expressions. Do NOT reinterpret the original artwork.

The result must remain immediately recognizable as the SAME ORIGINAL ILLUSTRATION.

==================================================
ARTWORK VERTICAL POSITION
==================================================

Position the main illustration BELOW the protected central title/subtitle area. The topmost meaningful part of the original artwork should begin BELOW the central title/subtitle placement area.

Leave a MODERATE, NATURAL breathing space between: SUBTITLE and MAIN ILLUSTRATION. Do NOT make this gap excessively large. Do NOT allow the artwork to creep upward into the central typography area. Small decorative motifs may occupy parts of this transition space if they are contextually appropriate.

If there is a conflict between: A) slightly smaller artwork and B) preserving a clean central title area — CHOOSE A. The central title area must remain usable.

==================================================
MAXIMUM ARTWORK SCALE
==================================================

After protecting the title area, make the original illustration as LARGE as practically possible. Do NOT create a small centered illustration. Do NOT add excessive white margins around the artwork. Do NOT unnecessarily shrink the artwork. The artwork should dominate the lower portion of the cover.

==================================================
MAXIMUM HORIZONTAL COVERAGE
==================================================

This is a major priority. Make the artwork extend as close as practically possible to BOTH the LEFT and RIGHT canvas edges. Target approximately 99.9% horizontal coverage where physically possible. Keep only a tiny visible white safety gap. The artwork may visually approach or nearly touch the left and right boundaries.

DO NOT crop important artwork. DO NOT clip important objects. DO NOT remove meaningful elements merely to increase width. If the original composition naturally allows extremely narrow side margins, use them.

Prefer: LARGE ARTWORK + VERY NARROW SIDE MARGINS over: SMALL ARTWORK + LARGE SIDE MARGINS.

==================================================
BOTTOM MARGIN
==================================================

Push the artwork toward the bottom edge as much as practically possible. Target approximately 5px of white margin at final output resolution. Do NOT create a large bottom margin. Do NOT shrink the artwork merely to increase bottom padding.

==================================================
SOURCE BORDER
==================================================

If the original image contains a border, frame, rounded rectangle, perimeter outline, or enclosing frame: REMOVE IT COMPLETELY. The source border is a layout artifact. Do NOT preserve it. Do NOT replace it. Do NOT create a new border.

==================================================
CANVAS
==================================================

Final canvas MUST be exactly 1:1 square.
Background:
- pure white
- clean
- flat
- untextured
Artwork:
- pure black line art
- white background
No:
- color
- gray
- shading
- gradients
- shadows
- cross-hatching
- 3D effects
- texture

==================================================
OPEN BORDERLESS COMPOSITION
==================================================

The final cover must have NO:
- border
- frame
- perimeter line
- rectangular frame
- rounded frame
- corner frame
- decorative frame
- enclosing outline
- panel
- box
- banner
- ribbon
- separator
- horizontal divider
- vertical divider

The composition must feel OPEN and BORDERLESS. Decorations must exist as independent organic accents, NOT as an enclosing structure.

==================================================
EDGE BEHAVIOR
==================================================

TOP EDGE: Keep clean white space. No major artwork may touch the top edge. Small peripheral decorative motifs may approach the upper edges if appropriate, but they must never create a border or decorative ceiling.

LEFT AND RIGHT: The main artwork may approach extremely close to the edges. Keep only a tiny safety gap where necessary.

BOTTOM: Artwork may approach extremely close to the bottom edge. Target approximately 5px white margin.

Never create a perimeter line.

==================================================
COMPOSITION PRIORITY
==================================================

Follow this priority order:
1. Preserve the original illustration.
2. Protect a large, clean CENTRAL title/subtitle placement area.
3. Keep the central typography area free from major artwork.
4. Keep the central typography area predominantly empty and white.
5. Allow a FEW small decorative motifs around the PERIPHERAL EDGES of the title zone.
6. Never allow decoration to interfere with the future title or subtitle.
7. Keep a moderate natural gap below the subtitle.
8. Make the original artwork as large as practically possible.
9. Maximize left/right artwork coverage.
10. Minimize bottom margin.
11. Add sparse, context-aware decorations around the composition.
12. Keep decorations organic, irregular, and non-repetitive.
13. Keep the entire composition open and borderless.
14. Never generate text.

If any instruction conflicts with the CENTRAL TITLE/SUBTITLE PLACEMENT AREA: PROTECT THE CENTRAL TYPOGRAPHY AREA FIRST. However, do NOT interpret this as requiring the entire upper 30% to be completely decoration-free. The CENTER must be clean. The PERIPHERY may contain subtle decorative accents.

==================================================
FINAL VISUAL CHECK
==================================================

Before generating the final image, verify:
- 1:1 square canvas.
- Original illustration remains recognizable.
- Original characters and objects remain faithful.
- Original proportions remain faithful.
- Source border is removed.
- Approximately top 30% functions primarily as a protected title/subtitle zone.
- The CENTRAL title placement area is predominantly EMPTY WHITE SPACE.
- The future TITLE has sufficient room.
- The future SUBTITLE has sufficient room.
- No major artwork enters the central title area.
- No balloon, character, animal, building, or major object enters the central typography core.
- There is a moderate natural gap between subtitle area and artwork.
- Artwork remains very large.
- Artwork is not unnecessarily shrunk.
- Artwork reaches extremely close to left and right edges.
- Bottom margin is extremely small.
- A FEW small context-aware decorations appear naturally around the composition.
- Some small decorations MAY subtly overlap the OUTER EDGES of the title/subtitle whitespace.
- The central title/subtitle placement area remains unobstructed.
- Decorations do NOT fill the title core.
- Decorations do NOT sit directly behind the future title.
- Decorations do NOT sit directly behind the future subtitle.
- Decorations do NOT form a frame.
- Decorations do NOT form repetitive patterns.
- No border.
- No frame.
- No divider.
- No text.
- No color.
- No gray.
- No shading.

==================================================
FINAL OUTPUT
==================================================

Generate ONE strictly 1:1 square coloring-book cover. The final result should visually communicate:

LARGE CLEAN TITLE SPACE + SMALL SUBTITLE SPACE + NATURAL BREATHING SPACE + SUBTLE PERIPHERAL DECORATION + LARGE ORIGINAL ILLUSTRATION + EXTREMELY NARROW SIDE MARGINS + VERY SMALL BOTTOM MARGIN + SPARSE NATURAL DECORATION + OPEN BORDERLESS WHITE BACKGROUND

The most important requirement is: KEEP THE CENTRAL TITLE + SUBTITLE PLACEMENT AREA CLEAN AND USABLE, WHILE ALLOWING A FEW SMALL, ORGANIC, CONTEXT-AWARE DECORATIVE MOTIFS TO SUBTLY OVERLAP THE OUTER EDGES OF THE SURROUNDING TITLE WHITESPACE.

The decoration should feel naturally integrated into the composition, NOT completely separated from the title area. Do NOT let the original artwork or decorations destroy the central title/subtitle placement area. Do NOT make the entire upper area unnaturally empty. The cover must look intentionally designed for professional TITLE + SUBTITLE placement, while keeping the original illustration as large and faithful as practically possible.`;

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
