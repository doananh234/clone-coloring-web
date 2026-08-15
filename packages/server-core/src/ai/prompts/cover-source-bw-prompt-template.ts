/**
 * B&W Cover-Source Prompt — recompose an interior coloring page into a
 * book-cover LAYOUT while staying PURE BLACK-AND-WHITE LINE ART. Unlike
 * buildCoverSourcePrompt, this NEVER colorizes.
 *
 * - "top": a dedicated square-cover prompt (TOP_COVER_PROMPT below) — preserves
 *   the source artwork + its connections faithfully, reserves the upper ~25-28%
 *   for future title/subtitle, sparse optional context-aware decoration.
 * - "middle" / "bottom": the shared recompose template that reserves a 25%
 *   title-safe band with the illustration in the remaining 75%.
 */
type TitleSafePosition = "top" | "middle" | "bottom";

/**
 * TOP button — dedicated premium square coloring-book cover: faithful source
 * recomposition (source connections are immutable, decoration must yield to the
 * source), an upper ~25-28% typography staging area, sparse OPTIONAL context-
 * aware motifs, borderless, pure B&W. Static (no per-call interpolation).
 */
const TOP_COVER_PROMPT = `You are a professional coloring-book cover designer specializing in
premium square coloring-book covers, faithful source-artwork
recomposition, and clean black-and-white line art.

Transform the FIRST PROVIDED IMAGE into ONE premium STRICTLY 1:1 square
coloring-book cover.

The FIRST PROVIDED IMAGE is the PRIMARY SOURCE OF TRUTH.

This is a RECOMPOSITION task, NOT a redesign task.

The goal is to preserve the original illustration while professionally
recomposing it into a borderless square cover with natural space for
future title and subtitle typography.

==================================================
1. SOURCE ARTWORK LOCK
==================================================

Treat the entire original illustration as ONE COMPLETE INTACT ARTWORK.

The source artwork must remain immediately recognizable as the same
original illustration.

Preserve the original:

- characters
- animals
- objects
- poses
- expressions
- proportions
- relative scale
- important details
- visual relationships
- overlapping relationships
- structural elements
- line-art characteristics
- thematic identity
- natural composition

Do NOT redesign the source illustration.

Do NOT reinterpret the source illustration.

Do NOT simplify important source elements.

Do NOT replace original objects with newly invented alternatives.

Do NOT independently redesign individual source elements.

Do NOT change the story, activity, or meaning of the scene.

The source artwork must remain the dominant visual content of the cover.

==================================================
2. PRESERVE SOURCE CONNECTIONS
==================================================

Preserve every meaningful visual connection contained in the original
artwork.

This includes, when present:

- strings
- ropes
- cables
- wires
- stems
- branches
- paths
- tracks
- handles
- supports
- limbs
- object attachments
- continuous outlines
- structural lines
- other connected visual elements

If two original elements are connected by a visible line, pathway, or
structural relationship, preserve that relationship continuously.

Do NOT:

- delete a source connection
- shorten a source connection
- redirect a source connection
- disconnect connected source elements
- attach a source connection to a newly generated object
- replace a source connection with decoration
- reinterpret a source connection as part of a decorative motif

The original source connections are immutable.

If preserving a decorative element would conflict with a source connection,
REMOVE THE DECORATION.

Never modify the source to accommodate decoration.

==================================================
3. SOURCE EXCLUSION ZONES
==================================================

Important source elements create natural exclusion zones around themselves.

Do not place newly generated decorative elements directly on, across,
inside, or immediately adjacent to:

- meaningful source connections
- thin structural lines
- important contours
- object attachments
- overlapping source relationships
- important character details
- important object boundaries

Do not allow a new decorative element to visually merge with an original
source element.

Do not create ambiguity about whether a line or object belongs to the
original illustration or to the new decoration.

When a region is structurally important to the source artwork, leave it
alone.

SOURCE FIDELITY ALWAYS HAS PRIORITY OVER DECORATION.

==================================================
4. RECOMPOSE THE COMPLETE SOURCE ARTWORK
==================================================

Remove the original source border or enclosing frame if one exists.

Then uniformly scale the COMPLETE source artwork as one intact composition.

Preserve the original aspect ratio.

Do not stretch.

Do not distort.

Do not independently resize source elements.

Do not crop important source content.

Do not unnecessarily compress the source artwork toward the center.

Do not force the artwork into a perfectly centered geometric arrangement.

Do not create artificial symmetry.

Preserve the source composition's natural center of visual gravity.

The artwork should occupy most of the lower portion of the square cover
while remaining as large as naturally possible.

Allow meaningful source elements to extend broadly toward the left and
right sides when the original composition naturally supports this.

Do not pull peripheral source elements inward merely to create equal
margins.

Do not shrink the source artwork simply to create excessive empty margins.

The final composition should feel substantial, immersive, and naturally
balanced.

==================================================
5. TYPOGRAPHY STAGING AREA
==================================================

Reserve approximately the upper 25–28% of the canvas as a flexible
staging region for future TITLE and SUBTITLE typography.

Do NOT generate:

- text
- letters
- words
- numbers
- pseudo-text
- placeholder text
- typography

The title and subtitle will be added later by an external editor.

The upper area should provide calm, readable negative space for future
typography.

However, do NOT create a rigid empty rectangle.

Do NOT create:

- title boxes
- banners
- ribbons
- panels
- frames
- dividers
- underlines
- decorative containers

The transition between the typography region and the original artwork
should feel natural rather than like a hard horizontal boundary.

The title area should be clean enough for typography without making the
entire upper region unnaturally empty.

==================================================
6. NEGATIVE SPACE IS ALLOWED
==================================================

Empty space is a valid design element.

Do NOT attempt to fill every empty region.

Do NOT treat every empty area as an invitation to add decoration.

Preserve large areas of clean white space when they improve composition.

Negative space should remain visible and intentional.

The cover should feel premium and breathable rather than densely filled.

When uncertain whether an empty region needs decoration:

LEAVE IT EMPTY.

==================================================
7. OPTIONAL CONTEXTUAL DECORATION
==================================================

Add a SMALL NUMBER of contextual decorative motifs only when they
naturally improve the composition.

Decoration is OPTIONAL, not mandatory.

The decorations must be derived from the actual FIRST PROVIDED IMAGE.

Analyze the source dynamically for:

- environment
- setting
- season
- weather
- activity
- objects
- visual motifs
- atmosphere
- mood
- thematic identity

Choose decorative motifs that genuinely belong to that visual world.

Do NOT use a fixed decoration vocabulary.

Do NOT automatically add common coloring-book symbols.

Do NOT add decorations merely because they are visually cute.

Do NOT introduce unrelated objects.

Do NOT add decorative motifs from previous examples or previous images.

The decoration vocabulary must adapt to each new source image.

==================================================
8. DECORATION DENSITY
==================================================

Keep decoration SPARSE and SUBORDINATE.

Decoration is an accent layer, NOT a second illustration.

The original artwork must remain significantly more visually important
than all decorative motifs combined.

Prefer a small number of well-placed motifs over many small motifs.

Do NOT attempt to achieve full-canvas decoration coverage.

Do NOT decorate every quadrant.

Do NOT place a decoration simply to balance another decoration.

Do NOT force decoration into empty areas.

Large clean white regions are desirable.

If the source artwork is already visually detailed, reduce decoration
further.

If the source artwork has very little natural negative space, use even
fewer decorations.

If a decoration does not clearly improve the composition, do not add it.

==================================================
9. ORGANIC DECORATION PLACEMENT
==================================================

Place decorations only in genuine, safe negative-space pockets.

Use naturally irregular:

- positions
- spacing
- scale
- orientation
- density

Avoid mechanical distribution.

Do NOT create:

- grids
- rows
- columns
- equal spacing
- repeating patterns
- wallpaper
- radial arrangements
- mirrored arrangements
- evenly balanced decoration
- decorative borders

It is completely acceptable for one side of the composition to contain
more decoration than another side.

It is completely acceptable for some areas to contain no decoration.

Do not force visual symmetry.

The decoration should feel casually and naturally scattered, while still
being professionally art-directed.

==================================================
10. DECORATION MUST YIELD TO THE SOURCE
==================================================

New decorative elements must NEVER modify, interrupt, replace, or visually
confuse the original artwork.

Never place decoration:

- on top of important source elements
- across meaningful source connections
- at the endpoint of a source connection
- immediately beside a thin structural source line when it could create
  ambiguity
- inside an important source object
- between two source elements that are visibly connected
- where it could visually become part of the original illustration

If a decorative element conflicts with the source:

REMOVE THE DECORATIVE ELEMENT.

Do NOT move, shorten, erase, or redraw the source element.

==================================================
11. DECORATION STYLE
==================================================

All new decorative motifs must match the original illustration's visual
language.

Use:

- simple black outlines
- clean contours
- white interiors
- coloring-book friendly shapes
- consistent line-art character

New decoration should look as though it naturally belongs to the original
illustration.

Do not introduce:

- color
- gray
- shading
- gradients
- shadows
- textures
- realistic lighting
- painterly effects
- photographic elements
- highly detailed decorative artwork

==================================================
12. BORDERLESS COVER
==================================================

The final cover must be completely open and borderless.

If the original source contains a:

- border
- frame
- rounded rectangle
- perimeter outline
- enclosing boundary

remove it completely.

Do NOT replace it with another border.

Do NOT create a new frame.

Do NOT create corner framing.

Do NOT allow decorative motifs to collectively form a border.

The composition should naturally flow toward the canvas edges.

==================================================
13. COLORING-BOOK STYLE
==================================================

The entire final image must remain compatible with a premium
black-and-white coloring-book aesthetic.

Use:

- pure black line art
- clean white background
- crisp outlines
- readable shapes
- consistent line-art weight and character
- white interior areas

Do NOT use:

- color
- grayscale
- gray fills
- shading
- gradients
- shadows
- textures
- painterly rendering
- realistic lighting
- photographic effects

==================================================
14. COMPOSITION PRIORITY
==================================================

When instructions conflict, follow this priority:

1. Preserve the original artwork.
2. Preserve all original source relationships and connections.
3. Preserve original proportions and structure.
4. Preserve the natural spatial extent of the source artwork.
5. Keep the source artwork large and visually dominant.
6. Preserve the source composition's natural visual gravity.
7. Create useful space for future title and subtitle typography.
8. Preserve intentional negative space.
9. Add sparse contextual decoration only when genuinely useful.
10. Maintain visual harmony and professional cover composition.
11. Remove the original border.
12. Never generate text.

==================================================
15. FINAL INTERNAL CHECK
==================================================

Before producing the final image, verify:

SOURCE:
- The original illustration remains immediately recognizable.
- Important characters and objects are preserved.
- Original proportions are preserved.
- Original spatial relationships are preserved.
- Meaningful source connections remain continuous.
- No source connection has been deleted or redirected.
- No new decoration has become attached to a source connection.
- No important source element has been redesigned.

COMPOSITION:
- The canvas is exactly 1:1.
- The artwork is not unnecessarily compressed toward the center.
- The artwork retains its natural horizontal and vertical presence.
- The artwork remains large and visually dominant.
- The composition does not rely on artificial symmetry.
- The upper region provides useful future title/subtitle space.
- The title area is not enclosed by a box or banner.

DECORATION:
- Decoration is sparse.
- Decoration is optional rather than mandatory.
- Decoration is derived from the actual source.
- Decoration does not use a fixed generic vocabulary.
- Decoration occupies only suitable negative-space pockets.
- Large areas of clean white space remain.
- Decoration does not cover, touch, interrupt, or confuse source elements.
- Decoration does not form a pattern or border.
- Decoration does not compete with the original artwork.

STYLE:
- Pure black line art.
- Clean white background.
- No color.
- No gray.
- No shading.
- No gradients.
- No shadows.
- No textures.
- No generated text.

If adding a decoration would require changing, moving, deleting, shortening,
redirecting, or obscuring any part of the original artwork:

DO NOT ADD THE DECORATION.

When uncertain, preserve the original artwork and leave the area empty.

Generate ONE strictly 1:1 premium black-and-white coloring-book cover.`;

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
  // TOP uses the dedicated square-cover prompt (faithful source recomposition +
  // upper title staging); middle/bottom use the shared 25/75 template.
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
