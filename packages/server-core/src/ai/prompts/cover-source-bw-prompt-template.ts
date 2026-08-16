/**
 * B&W Cover-Source Prompt — recompose an interior coloring page into a
 * book-cover LAYOUT while staying PURE BLACK-AND-WHITE LINE ART. Unlike
 * buildCoverSourcePrompt, this NEVER colorizes.
 *
 * Each title-safe position has its own dedicated, user-tuned prompt:
 * - "top": a TOP-CENTER title/subtitle header above the largest practical artwork.
 * - "middle": preserve the source composition, keep a usable MIDDLE title area.
 * - "bottom": preserve the source composition, keep a usable LOWER title area.
 * All three lock the original artwork + its structural connections; middle/bottom
 * additionally append a shared black-and-white / no-text / no-border guard.
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

/** Shared black-and-white / no-text / no-border guard appended to the middle and
 * bottom prompts (whose user-authored bodies omit the B&W + no-text contract). */
const BW_GUARD = `

==================================================
BLACK-AND-WHITE COLORING-BOOK LINE ART — NO TEXT
==================================================

The final image MUST be pure black-and-white coloring-book line art: clean black outlines on a pure white background. NO color, NO gray, NO grayscale, NO shading, NO gradients, NO shadows, NO textures, NO filled areas. Keep the original line weight and style.

Do NOT generate any text, letters, words, numbers, or typography — the title and subtitle are added later by an editor.

If the source contains an outer border, frame, rounded rectangle, or enclosing outline, remove it completely and do not add a new one.`;

/** MIDDLE button — preserve the source composition + structural connections, keep
 * a usable MIDDLE title area, sparse decoration, plus the shared B&W guard. */
const MIDDLE_COVER_PROMPT = `Create a children's book cover illustration based closely on the provided original artwork.

The most important requirement is to preserve the original artwork and composition. Treat the provided image as the structural foundation of the cover, not merely as inspiration.

PRESERVE THE ORIGINAL ARTWORK:
- Keep all main characters, objects, props, shapes, patterns, poses, proportions, orientations, and visual relationships faithful to the original.
- Preserve the original subject scale, relative positions, composition, perspective, and overall framing.
- Do not automatically center, shrink, enlarge, rearrange, or rebalance the main artwork just to create space for decorations or typography.
- Preserve the original cropping and allow elements to naturally approach or extend beyond the canvas edges when the original composition does so.
- Do not invent new major characters, objects, actions, or story elements.
- Do not redesign or reinterpret the main subject.

PRESERVE STRUCTURAL CONTINUITY:
- Preserve every original structural element and connection, including ropes, strings, cables, handles, straps, stems, borders, outlines, attachments, supports, and connecting lines.
- Every line that connects two original objects must remain connected to the correct objects.
- Never delete, replace, redirect, merge, hide, or reinterpret an original structural line as a decorative element.
- Do not allow clouds, flowers, stars, hearts, or other decorations to interrupt or attach themselves to original structural elements.

DECORATION:
Add a small amount of cute, playful background decoration that matches the visual language of the original artwork, such as simple clouds, stars, flowers, hearts, dots, sparkles, or other motifs that naturally belong to the illustration.

The decoration must remain secondary to the original artwork.

Use the existing negative space of the composition as the primary area for decoration. Do not rearrange the original artwork to create artificial space for decorations.

Keep the decoration sparse, varied, and naturally irregular:
- Avoid dense decoration.
- Avoid evenly filling the entire canvas.
- Avoid grid-like or symmetrical placement.
- Avoid repetitive spacing or identical clusters.
- Maintain generous areas of calm negative space.
- Let some areas remain almost completely undecorated.
- Decorations may appear near the main artwork when visually natural, but must never interfere with important characters, objects, or structural connections.

MIDDLE TITLE AREA:
Reserve a visually usable title area around the middle portion of the composition for later typography.

The middle title area should feel like a natural part of the original composition rather than an artificially empty band.

Maintain sufficient calm negative space around the middle area so that a title can later be placed clearly and read comfortably.

Do NOT force all characters or objects away from the middle merely to create a title area. Preserve the original composition first.

Decorations do not need to completely avoid the middle title area. A small number of subtle decorations may appear around or within the surrounding area when they naturally fit the composition, but keep the central title space visually calm and uncluttered.

The title area should have enough visual breathing room for typography without looking like a large empty hole.

OVERALL COMPOSITION:
The final result should feel like a professionally composed children's book cover while still looking unmistakably like the original artwork.

Preserve the original composition first.
Preserve structural relationships second.
Use existing negative space for decoration and typography third.

Do not redesign the artwork simply to make it look more like a generic book cover.${BW_GUARD}`;

/** BOTTOM button — preserve the source composition + structural connections, keep
 * a usable LOWER title area, sparse decoration, plus the shared B&W guard. */
const BOTTOM_COVER_PROMPT = `Create a children's book cover illustration based closely on the provided original artwork.

The most important requirement is to preserve the original artwork and composition. Treat the provided image as the structural foundation of the cover, not merely as inspiration.

PRESERVE THE ORIGINAL ARTWORK:
- Keep all main characters, objects, props, shapes, patterns, poses, proportions, orientations, and visual relationships faithful to the original.
- Preserve the original subject scale, relative positions, composition, perspective, and overall framing.
- Do not automatically center, shrink, enlarge, rearrange, or rebalance the main artwork just to create space for decorations or typography.
- Preserve the original cropping and allow elements to naturally approach or extend beyond the canvas edges when the original composition does so.
- Do not invent new major characters, objects, actions, or story elements.
- Do not redesign or reinterpret the main subject.

PRESERVE STRUCTURAL CONTINUITY:
- Preserve every original structural element and connection, including ropes, strings, cables, handles, straps, stems, borders, outlines, attachments, supports, and connecting lines.
- Every line that connects two original objects must remain connected to the correct objects.
- Never delete, replace, redirect, merge, hide, or reinterpret an original structural line as a decorative element.
- Do not allow clouds, flowers, stars, hearts, or other decorations to interrupt or attach themselves to original structural elements.

DECORATION:
Add a small amount of cute, playful background decoration that matches the visual language of the original artwork, such as simple clouds, stars, flowers, hearts, dots, sparkles, or other motifs that naturally belong to the illustration.

The decoration must remain secondary to the original artwork.

Use the existing negative space of the composition as the primary area for decoration. Do not rearrange the original artwork to create artificial space for decorations.

Keep the decoration sparse, varied, and naturally irregular:
- Avoid dense decoration.
- Avoid evenly filling the entire canvas.
- Avoid grid-like or symmetrical placement.
- Avoid repetitive spacing or identical clusters.
- Maintain generous areas of calm negative space.
- Let some areas remain almost completely undecorated.
- Decorations may appear near the main artwork when visually natural, but must never interfere with important characters, objects, or structural connections.

BOTTOM TITLE AREA:
Reserve a visually usable title area around the lower portion of the composition for later typography.

The bottom title area should feel like a natural part of the original composition rather than an artificially empty block.

Maintain sufficient calm negative space in the lower portion so that a title can later be placed clearly and read comfortably.

Do NOT force all characters or objects upward or away from the bottom merely to create a title area. Preserve the original composition first.

If important original artwork naturally occupies part of the lower area, do not remove, move, shrink, or redesign it just to create title space. Instead, use the naturally available negative space around it.

Decorations do not need to completely avoid the bottom title area. A small number of subtle decorations may appear around the surrounding area when they naturally fit the composition, but keep the main title placement area visually calm and uncluttered.

The bottom title area should have enough visual breathing room for typography without looking like a large artificial empty block.

OVERALL COMPOSITION:
The final result should feel like a professionally composed children's book cover while still looking unmistakably like the original artwork.

Preserve the original composition first.
Preserve structural relationships second.
Use existing negative space for decoration and typography third.

Do not redesign the artwork simply to make it look more like a generic book cover.${BW_GUARD}`;

export function buildCoverSourceBWPrompt(titleSafe: TitleSafePosition): string {
  // Each title-safe position has its own dedicated, user-tuned prompt.
  switch (titleSafe) {
    case "top":
      return TOP_COVER_PROMPT;
    case "middle":
      return MIDDLE_COVER_PROMPT;
    case "bottom":
      return BOTTOM_COVER_PROMPT;
  }
}
