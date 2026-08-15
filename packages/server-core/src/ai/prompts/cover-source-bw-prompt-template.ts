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
 * TOP-CENTER title + subtitle zone (with organic decoration around/below the
 * title), the original artwork kept large below, borderless, pure B&W line art.
 * Static (no per-call interpolation).
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

The most important visual balance is: LARGE TITLE SPACE + NATURAL DECORATION AROUND THE TITLE + LARGE ORIGINAL ARTWORK

Do NOT sacrifice the title space in order to enlarge the artwork. Do NOT sacrifice the artwork by shrinking it excessively. The final composition should feel like a professionally designed coloring-book cover, not like an illustration placed inside a blank template.

==================================================
PROTECTED TITLE + SUBTITLE ZONE — CRITICAL
==================================================

Reserve approximately the TOP 30% of the square canvas primarily for the future TITLE and SUBTITLE. The TITLE will be added later by an editor at the TOP CENTER. The SUBTITLE will be added later by an editor directly below the TITLE.

Do NOT generate any text. Do NOT generate placeholder text. Do NOT generate letters. Do NOT generate typography. The future text placement areas must remain completely unobstructed.

IMPORTANT: The MAIN ILLUSTRATION must NOT enter the CENTRAL TYPOGRAPHY AREA. No major original object may extend behind or through the future TITLE or SUBTITLE. Do NOT allow the balloon, house, animal, character, vehicle, building, or any other major subject from the original illustration to enter the central title/subtitle placement area. When uncertain, prioritize preserving a clean and usable central title/subtitle area.

==================================================
CENTRAL TYPOGRAPHY AREA VS SURROUNDING WHITESPACE
==================================================

CRITICAL DESIGN DISTINCTION: The ACTUAL FUTURE TEXT PLACEMENT AREAS must remain clean. However, the SURROUNDING WHITESPACE around those text areas does NOT need to be completely empty.

The central text placement area should remain predominantly white, clean, calm, and unobstructed. The surrounding whitespace may contain a FEW small, lightweight, context-aware decorative motifs.

This means: CLEAN TEXT AREA + ORGANIC DECORATION AROUND IT
NOT: COMPLETELY EMPTY ENTIRE TOP AREA.

==================================================
TITLE ZONE — ORGANIC DECORATION
==================================================

The title area should feel clean but naturally integrated with the rest of the cover. Small decorative motifs MAY appear:
- around the upper-left side of the title
- around the upper-right side of the title
- beside the title
- near the outer edges of the title
- immediately below the title
- in the whitespace between TITLE and SUBTITLE
- beside the subtitle
- around the outer perimeter of the typography zone
- in the transition area between typography and main artwork

IMPORTANT: A FEW SMALL DECORATIVE MOTIFS MAY APPEAR DIRECTLY BELOW THE FUTURE TITLE. This is intentional. They may occupy part of the whitespace between TITLE and SUBTITLE. They should feel like small floating thematic accents, similar to professionally designed children's coloring-book covers. The area between TITLE and SUBTITLE may therefore contain a few small decorative elements.

However:
The actual TITLE placement area must remain completely clear.
The actual SUBTITLE placement area must remain completely clear.
Decorations must never overlap the future text.
Decorations must never visually compete with the future text.
Decorations must never become large enough to reduce the usable title/subtitle space.

==================================================
DECORATION STYLE
==================================================

Analyze the original illustration and derive decorations from its actual visual theme. Decorations must match:
- environment
- season
- weather
- time of day
- activity
- atmosphere
- subject matter
- characters
- objects
- overall thematic identity

Use only simple small BLACK LINE-ART motifs. Decorations should be:
- sparse
- small
- lightweight
- subtle
- organic
- irregularly distributed
- varied in scale
- naturally integrated
- visually secondary to the main illustration and typography

Possible motifs may include, ONLY when appropriate to the source illustration:
- tiny flowers
- small stars
- leaves
- hearts
- clouds
- bubbles
- sparkles
- tiny thematic objects
- small nature elements
- other simple motifs derived from the original scene

Do NOT invent large new objects. Do NOT introduce unrelated themes.

==================================================
DECORATION PLACEMENT — IMPORTANT
==================================================

Decorations should be organically distributed rather than mechanically positioned. Use a few accents in different areas. Some may appear near the title. Some may appear immediately below the title. Some may appear between title and subtitle. Some may appear near the sides. Some may appear around the transition between typography and artwork. Some may appear in open areas around the main illustration.

The distribution should feel natural and slightly asymmetrical.

Do NOT create repetitive patterns. Do NOT create rows. Do NOT create columns. Do NOT create grids. Do NOT create symmetrical decorative arrangements. Do NOT create a decorative ceiling above the title. Do NOT create a decorative frame around the title. Do NOT create a corner frame. Do NOT create a decorative border. Do NOT create a banner. Do NOT create a ribbon. Do NOT create a panel. Do NOT create a box. Do NOT create a horizontal divider. Do NOT create a vertical divider. Do NOT create an underline beneath the title.

Decorations immediately below the title must appear as a FEW INDIVIDUAL FLOATING MOTIFS, NOT as a continuous line or separator.

==================================================
TITLE / SUBTITLE VISUAL STRUCTURE
==================================================

The intended visual hierarchy is approximately:

small motif small motif TITLE small motif ✦ small motif SUBTITLE natural breathing space MAIN ARTWORK

The exact arrangement must NOT be rigid. Do NOT force the motifs into a symmetrical layout. The title and subtitle remain the dominant empty placement areas. Small decorative motifs may occupy the surrounding whitespace and the space between the two future text elements. The central text placement areas must remain unobstructed.

==================================================
MAIN ILLUSTRATION — PRIMARY SOURCE
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
- original composition relationships

Do NOT redesign the original illustration. Do NOT replace characters. Do NOT invent new major objects. Do NOT substantially alter the scene. Do NOT change character identity. Do NOT change poses. Do NOT change expressions. Do NOT reinterpret the original artwork. Do NOT simplify away important original details. Do NOT transform the original illustration into a different scene.

The final artwork must remain immediately recognizable as the SAME ORIGINAL ILLUSTRATION.

==================================================
ARTWORK VERTICAL POSITION
==================================================

Position the MAIN ILLUSTRATION BELOW the protected central typography area. The topmost meaningful part of the original artwork should begin BELOW the future TITLE + SUBTITLE placement area.

Leave a MODERATE and NATURAL breathing space between: SUBTITLE and MAIN ILLUSTRATION. Do NOT make this gap excessively large. Do NOT allow the artwork to creep upward into the central typography area. Small decorative motifs may occupy parts of this transition space if contextually appropriate.

If there is a conflict between: A) slightly smaller artwork and B) preserving a clean usable title/subtitle area — CHOOSE A. The typography area must remain usable.

==================================================
MAXIMUM ARTWORK SCALE
==================================================

After protecting the title/subtitle area, make the original illustration as LARGE as practically possible. Do NOT create a small centered illustration. Do NOT unnecessarily shrink the artwork. Do NOT create excessive white margins around the artwork. The original illustration should dominate the lower portion of the cover. Use the available lower canvas efficiently.

==================================================
MAXIMUM HORIZONTAL COVERAGE
==================================================

This is a MAJOR priority. Make the main illustration extend as close as practically possible to BOTH the LEFT and RIGHT canvas edges. Target approximately 99.9% horizontal coverage where physically possible. Keep only a tiny visible white safety gap where necessary. The artwork may visually approach or nearly touch the left and right boundaries.

DO NOT crop important artwork. DO NOT clip important objects. DO NOT remove meaningful elements merely to increase width. If the original composition naturally allows extremely narrow side margins, use them.

Prefer: LARGE ARTWORK + VERY NARROW SIDE MARGINS over: SMALL ARTWORK + LARGE SIDE MARGINS.

==================================================
BOTTOM MARGIN
==================================================

Push the main illustration toward the bottom edge as much as practically possible. Target approximately 5px of white margin at final output resolution. Do NOT create a large bottom margin. Do NOT shrink the artwork merely to increase bottom padding.

==================================================
SOURCE BORDER
==================================================

If the original image contains:
- border
- frame
- rounded rectangle
- perimeter outline
- enclosing frame
- decorative outer box
REMOVE IT COMPLETELY. The source border is a layout artifact. Do NOT preserve it. Do NOT replace it. Do NOT create a new border.

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
Decorations:
- pure black line art
- white background
Absolutely NO:
- color
- gray
- shading
- gradients
- shadows
- cross-hatching
- 3D effects
- texture
- watercolor
- colored fills
- gray fills

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

The composition must feel OPEN and BORDERLESS. Decorations must exist as independent organic accents. They must NEVER connect together to create an enclosing structure.

==================================================
EDGE BEHAVIOR
==================================================

TOP EDGE: Keep clean white space. No major artwork may touch the top edge. Small peripheral decorative motifs may approach the upper region if appropriate. However, they must never form a decorative ceiling or border.

LEFT AND RIGHT: The main artwork may approach extremely close to the edges. Keep only a tiny safety gap where necessary.

BOTTOM: Artwork may approach extremely close to the bottom edge. Target approximately 5px white margin.

Never create a perimeter line.

==================================================
COMPOSITION PRIORITY
==================================================

Follow this priority order:
1. Preserve the original illustration.
2. Protect a large, usable CENTRAL TITLE + SUBTITLE placement area.
3. Keep the actual future TITLE placement area clean.
4. Keep the actual future SUBTITLE placement area clean.
5. Keep the central typography area predominantly white and calm.
6. Allow a FEW small decorative motifs around the typography.
7. Allow a FEW small decorative motifs immediately below the TITLE.
8. Allow a FEW small decorative motifs in the whitespace between TITLE and SUBTITLE.
9. Keep decorations away from the actual text placement areas.
10. Keep a moderate natural gap below the SUBTITLE.
11. Make the original artwork as large as practically possible.
12. Maximize left/right artwork coverage.
13. Minimize bottom margin.
14. Add sparse context-aware decorations.
15. Keep decorations organic, irregular, asymmetric, and non-repetitive.
16. Keep the entire composition open and borderless.
17. Never generate text.

If any instruction conflicts with the actual future TITLE or SUBTITLE placement areas: PROTECT THE TEXT PLACEMENT AREAS FIRST. However: DO NOT interpret this as requiring the ENTIRE TOP 30% to be completely decoration-free. The actual text areas must be clean. The surrounding whitespace may contain subtle decorative accents.

==================================================
FINAL VISUAL CHECK
==================================================

Before generating the final image, verify:
- Final canvas is strictly 1:1 square.
- Original illustration remains immediately recognizable.
- Original characters remain faithful.
- Original animals remain faithful.
- Original objects remain faithful.
- Original proportions remain faithful.
- Original poses remain faithful.
- Original expressions remain faithful.
- Source border is completely removed.
- No new border or frame is created.
- Approximately the top 30% functions primarily as the title/subtitle area.
- The actual TITLE placement area is large and clean.
- The actual SUBTITLE placement area is large and clean.
- The future TITLE has sufficient room.
- The future SUBTITLE has sufficient room.
- No major artwork enters the central typography area.
- No balloon, character, animal, building, vehicle, or major object enters the title/subtitle placement areas.
- There is a moderate natural gap between subtitle and artwork.
- Artwork remains very large.
- Artwork is not unnecessarily shrunk.
- Artwork reaches extremely close to both left and right edges.
- Bottom margin is extremely small.
- A FEW small context-aware decorative motifs appear naturally.
- Some small decorative motifs may appear immediately below the future TITLE.
- Some small decorative motifs may appear between TITLE and SUBTITLE.
- These motifs remain small and visually secondary.
- These motifs do NOT overlap the future text.
- Decorations do NOT create an underline.
- Decorations do NOT create a divider.
- Decorations do NOT create a frame.
- Decorations do NOT create a border.
- Decorations do NOT form repetitive patterns.
- Decorations do NOT form rows, columns, grids, or symmetrical arrangements.
- The central text placement areas remain unobstructed.
- The surrounding typography whitespace feels naturally decorated rather than completely empty.
- No text is generated.
- No letters are generated.
- No color is present.
- No gray is present.
- No shading is present.
- No gradients are present.
- No texture is present.

==================================================
FINAL OUTPUT
==================================================

Generate ONE strictly 1:1 square coloring-book cover. The final result should visually communicate:

LARGE CLEAN TITLE SPACE + NATURAL SMALL DECORATION AROUND TITLE + SMALL DECORATIVE ACCENTS BETWEEN TITLE AND SUBTITLE + CLEAN SUBTITLE SPACE + NATURAL BREATHING SPACE + LARGE ORIGINAL ILLUSTRATION + EXTREMELY NARROW SIDE MARGINS + VERY SMALL BOTTOM MARGIN + SPARSE CONTEXT-AWARE DECORATION + OPEN BORDERLESS WHITE BACKGROUND

The most important requirement is: KEEP THE ACTUAL TITLE AND SUBTITLE PLACEMENT AREAS CLEAN AND USABLE, WHILE ALLOWING A FEW SMALL, ORGANIC, CONTEXT-AWARE DECORATIVE MOTIFS TO APPEAR AROUND THE TITLE AND EVEN DIRECTLY BELOW THE TITLE.

The decoration should feel naturally integrated into the typography area, NOT completely separated from it. The space should NOT look like a large empty white rectangle. At the same time, decorations must remain subtle enough that the future TITLE and SUBTITLE can be placed clearly and professionally.

Do NOT let the original artwork or decorations destroy the usable TITLE + SUBTITLE space. Do NOT make the entire upper area unnaturally empty. Do NOT make the decoration overly dense. The final cover should look like a professionally art-directed coloring-book cover designed specifically for later TITLE + SUBTITLE insertion.`;

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
