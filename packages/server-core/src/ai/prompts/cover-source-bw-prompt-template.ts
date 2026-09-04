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
 * source), an upper ~28-32% typography staging area, sparse OPTIONAL context-
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
future TITLE and SUBTITLE typography in the TOP portion of the cover.

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

If preserving a decorative element would conflict with a source
connection:

REMOVE THE DECORATION.

Never modify the source to accommodate decoration.

==================================================
3. SOURCE EXCLUSION ZONES
==================================================

Important source elements create natural exclusion zones around
themselves.

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

Then uniformly scale and reposition the COMPLETE source artwork as one
intact composition.

Preserve the original aspect ratio.

Do not stretch.

Do not distort.

Do not independently resize source elements.

Do not independently reposition source elements.

Do not crop important source content.

Do not unnecessarily compress the source artwork toward the center.

Do not force the artwork into a perfectly centered geometric arrangement.

Do not create artificial symmetry.

Preserve the source composition's natural center of visual gravity.

For this TOP COVER layout, place the main source artwork predominantly
within the LOWER and LOWER-MIDDLE portions of the square canvas.

The source artwork should remain LARGE, SUBSTANTIAL, and VISUALLY
DOMINANT.

Do NOT shrink the artwork excessively merely to create top typography
space.

Use the available width naturally.

Allow meaningful source elements to extend broadly toward the left and
right sides when the original composition naturally supports this.

Do not pull peripheral source elements inward merely to create equal
margins.

Do not force the entire source artwork into a narrow central column.

Do not make the source composition look like a centered sticker floating
inside the square canvas.

Preserve the original artwork's natural horizontal spread and visual
gravity.

==================================================
5. TOP TYPOGRAPHY STAGING REGION
==================================================

Reserve approximately the upper 28–32% of the canvas as a flexible
staging region for future TITLE and SUBTITLE typography.

The title and subtitle will be added later by an external editor.

Do NOT generate:

- text
- letters
- words
- numbers
- pseudo-text
- placeholder text
- typography

The upper region should provide calm, readable negative space for future
typography.

The highest point of the main source artwork should generally remain
below the strongest central portion of this typography region.

Create slightly more breathing room between the TOP CANVAS EDGE and the
highest major source element than would occur in an ordinary centered
composition.

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
6. TYPOGRAPHY SPACE MUST NOT OVER-SHRINK THE SOURCE
==================================================

Creating title space does NOT justify excessive reduction of the source
artwork.

Use repositioning before scaling whenever possible.

Prefer moving the complete source composition moderately downward rather
than aggressively shrinking it.

Preserve the source artwork at the largest natural scale compatible with
a useful TOP typography region.

Do NOT sacrifice:

- recognizability
- visual impact
- natural horizontal extent
- important details
- source relationships
- compositional presence

merely to create excessive title clearance.

The desired result is:

USEFUL TOP NEGATIVE SPACE
+
LARGE SOURCE ARTWORK

not:

LARGE EMPTY TOP AREA
+
SMALL CENTERED ARTWORK.

==================================================
7. NEGATIVE SPACE IS ALLOWED
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
8. OPTIONAL CONTEXTUAL DECORATION
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
9. DECORATION DENSITY
==================================================

Keep decoration SPARSE and SUBORDINATE.

Decoration is an accent layer, NOT a second illustration.

The original artwork must remain significantly more visually important
than all decorative motifs combined.

Prefer a small number of well-placed motifs over many small motifs.

Do NOT attempt to achieve full-canvas decoration coverage.

Do NOT decorate every quadrant.

Do NOT place a decoration simply to balance another decoration.

Do NOT force decoration into every empty area.

Large clean white regions are desirable.

If the source artwork is already visually detailed, reduce decoration
further.

If the source artwork has very little natural negative space, use even
fewer decorations.

If a decoration does not clearly improve the composition, do not add it.

==================================================
10. ORGANIC DECORATION PLACEMENT
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

The decoration should feel casually and naturally scattered while still
being professionally art-directed.

==================================================
11. TOP TYPOGRAPHY REGION DECORATION
==================================================

The TOP typography region should remain calm and readable, but it does
NOT need to be completely sterile.

A very small number of SMALL contextual decorative motifs may appear
within peripheral or secondary portions of the upper region when they
improve visual continuity.

However:

- preserve the strongest central negative-space pocket for future TITLE
- keep decoration sparse
- keep motifs small
- avoid dense clusters
- avoid large decorative objects
- avoid horizontal decorative bands
- avoid surrounding the future title area with decoration
- avoid creating a visible decorative frame around typography

Do not deliberately route decoration around an invisible title box.

The typography region should feel like part of the same illustration,
not like a separate empty panel.

==================================================
12. LOWER-AREA VISUAL SUPPORT
==================================================

Do not allow the lower portion of the cover to become visually dead or
completely isolated merely because the main artwork already occupies much
of the lower composition.

When genuine safe negative-space pockets exist around or beneath lower
source elements, a VERY SMALL amount of contextual decoration may be
introduced to maintain visual continuity.

This decoration must remain:

- sparse
- small
- secondary
- source-derived
- naturally positioned

Do NOT construct a decorative foreground.

Do NOT create dense bottom clusters.

Do NOT create a decorative floor.

Do NOT fill the entire bottom edge.

Do NOT add large scenery merely to occupy lower empty space.

The purpose is only to prevent unnecessarily barren lower pockets and to
connect the main artwork naturally with the surrounding cover.

If the lower area already contains sufficient visual information:

DO NOT ADD MORE.

==================================================
13. DECORATION MUST YIELD TO THE SOURCE
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
14. DECORATION STYLE
==================================================

All new decorative motifs must match the original illustration's visual
language.

Use:

- simple black outlines
- clean contours
- white interiors
- coloring-book-friendly shapes
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
15. DO NOT BUILD A SECOND SCENE
==================================================

Decoration must remain decoration.

Do NOT transform decorative accents into a newly invented foreground,
background, or secondary environment.

Do NOT invent large:

- plants
- bushes
- rocks
- clouds
- terrain
- foliage
- architecture
- environmental masses
- landscape structures

merely to fill available space.

If environmental motifs are genuinely appropriate to the source, keep
newly generated versions SMALL, SIMPLE, and ACCENT-LIKE.

The original source illustration must remain the only major scene.

==================================================
16. BORDERLESS COVER
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
17. COLORING-BOOK STYLE
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
18. VISUAL HIERARCHY
==================================================

The final composition contains THREE visual systems:

1. SOURCE ARTWORK
2. NATURAL NEGATIVE SPACE FOR TYPOGRAPHY
3. LIGHT CONTEXTUAL DECORATION

Their hierarchy is:

SOURCE ARTWORK
>
TYPOGRAPHY READABILITY
>
DECORATION

The source artwork must always remain the visual anchor.

Typography space should emerge naturally from composition.

Decoration should support the cover without competing with either the
source artwork or future typography.

==================================================
19. COMPOSITION PRIORITY
==================================================

When instructions conflict, follow this priority:

1. Preserve the original artwork.
2. Preserve all original source relationships and connections.
3. Preserve original proportions and structure.
4. Preserve the natural spatial extent of the source artwork.
5. Keep the source artwork large and visually dominant.
6. Preserve the source composition's natural visual gravity.
7. Create sufficient TOP space for future title and subtitle typography.
8. Prefer repositioning over excessive source scaling.
9. Preserve intentional negative space.
10. Add sparse contextual decoration only when genuinely useful.
11. Maintain a small amount of visual support in suitable lower empty
    areas when compositionally beneficial.
12. Maintain visual harmony and professional cover composition.
13. Remove the original border.
14. Never generate text.

==================================================
20. FINAL INTERNAL CHECK
==================================================

Before producing the final image, verify:

SOURCE:

- The original illustration remains immediately recognizable.
- Important characters and objects are preserved.
- Original proportions are preserved.
- Original spatial relationships are preserved.
- Original overlapping relationships are preserved.
- Meaningful source connections remain continuous.
- No source connection has been deleted.
- No source connection has been shortened.
- No source connection has been redirected.
- No new decoration has become attached to a source connection.
- No important source element has been redesigned.

COMPOSITION:

- The canvas is exactly 1:1.
- The artwork occupies primarily the lower and lower-middle composition.
- The artwork is not unnecessarily compressed toward the center.
- The artwork retains its natural horizontal and vertical presence.
- The artwork remains large and visually dominant.
- Peripheral source elements have not been unnecessarily pulled inward.
- The composition does not rely on artificial symmetry.
- The upper region provides clearly useful future TITLE and SUBTITLE
  space.
- There is sufficient breathing room between the top canvas edge and the
  highest major source element.
- The title area is not enclosed by a box, banner, or panel.
- The source artwork has not been excessively shrunk to create title
  space.

DECORATION:

- Decoration is sparse.
- Decoration is optional rather than mandatory.
- Decoration is derived from the actual source.
- Decoration does not use a fixed generic vocabulary.
- Decoration occupies only suitable negative-space pockets.
- Large areas of clean white space remain.
- Decoration does not cover, touch, interrupt, or confuse important
  source elements.
- Decoration does not interfere with source connections.
- Decoration does not form a pattern.
- Decoration does not form a border.
- Decoration does not compete with the original artwork.
- Decoration does not create a second scene.
- The upper typography region remains readable.
- The upper typography region does not look like an artificial empty
  rectangle.
- Suitable lower empty areas are not unnecessarily barren when a tiny
  contextual accent would naturally improve the composition.
- Lower decoration remains very light and subordinate.

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

==================================================
21. FINAL DECISION RULE
==================================================

When deciding between preserving source fidelity, creating typography
space, or adding decoration:

PRESERVE THE SOURCE FIRST.

If more TOP typography space is required:

REPOSITION THE COMPLETE SOURCE ARTWORK DOWNWARD BEFORE SHRINKING IT.

If some scaling is still required:

USE THE MINIMUM UNIFORM SCALING NECESSARY.

Never independently move or resize individual source elements.

If adding a decoration would require changing, moving, deleting,
shortening, redirecting, obscuring, or visually confusing any part of the
original artwork:

DO NOT ADD THE DECORATION.

If an empty region already creates good visual breathing room:

LEAVE IT EMPTY.

If a safe lower negative-space pocket feels unnaturally barren and a
small source-derived motif would improve visual continuity:

ADD ONLY A LIGHT DECORATIVE ACCENT.

When uncertain:

PRESERVE THE ORIGINAL ARTWORK AND PRESERVE NEGATIVE SPACE.

==================================================
22. TARGET VISUAL RESULT
==================================================

The final cover should feel like ONE naturally composed premium
illustration.

It should contain:

- a large and faithful source artwork
- strong natural visual presence
- sufficient TOP negative space for future TITLE and SUBTITLE
- a natural transition between typography space and illustration
- sparse source-derived contextual decoration
- occasional subtle decoration in suitable lower empty pockets
- substantial clean white negative space
- no artificial symmetry
- no central compression
- no invented secondary scene

The final result should look professionally composed even before
typography is added.

After typography is added, the TITLE and SUBTITLE should fit naturally
into the upper negative-space structure without requiring the source
illustration to be redesigned.

Generate ONE strictly 1:1 premium black-and-white coloring-book
TOP COVER.`;

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
 * a usable LOWER title area, light contextual decoration. Self-contained
 * (includes its own B&W / no-text / no-border contract). */
const BOTTOM_COVER_PROMPT = `You are a professional coloring-book cover designer specializing in
premium square coloring-book covers, faithful source-artwork
recomposition, and clean black-and-white line art.

Transform the FIRST PROVIDED IMAGE into ONE premium STRICTLY 1:1 square
coloring-book cover.

The FIRST PROVIDED IMAGE is the PRIMARY SOURCE OF TRUTH.

This is a RECOMPOSITION task, NOT a redesign task.

The goal is to preserve the original illustration while professionally
recomposing it into a borderless square cover with natural negative space
for future TITLE and SUBTITLE typography in the BOTTOM portion of the
cover.

IMPORTANT:
The future typography area must remain READABLE, but it must NOT become
an artificially empty or decoration-free region.

The final image should still look like a naturally complete illustrated
cover even before typography is added.

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
Do NOT change the story, activity, environment, or meaning of the scene.

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

If a decorative element would conflict with a source connection:
REMOVE THE DECORATION.

Never modify the source to accommodate decoration.

==================================================
3. SOURCE EXCLUSION ZONES
==================================================

Important source elements create natural exclusion zones around
themselves.

Do not place newly generated decorative elements directly on, across,
inside, or dangerously close to:
- meaningful source connections
- thin structural lines
- important contours
- object attachments
- overlapping source relationships
- important character details
- important object boundaries

Do not allow newly generated decoration to visually merge with an
original source element.

Do not create ambiguity about whether a line or object belongs to the
original illustration or to the new decoration.

When a region is structurally important to the source artwork, leave it
alone.

SOURCE FIDELITY ALWAYS HAS PRIORITY OVER DECORATION.

==================================================
4. RECOMPOSE THE COMPLETE SOURCE ARTWORK
==================================================

Remove the original source border or enclosing frame if one exists.

Then uniformly scale and reposition the COMPLETE source artwork as one
intact composition.

Preserve the original aspect ratio.
Do not stretch.
Do not distort.
Do not independently resize source elements.
Do not independently reposition source elements.
Do not crop important source content.
Do not unnecessarily compress the source artwork toward the center.
Do not force the artwork into a perfectly centered geometric arrangement.
Do not create artificial symmetry.

Preserve the source composition's natural center of visual gravity.

For this BOTTOM COVER layout, place the main source artwork predominantly
within the UPPER and UPPER-MIDDLE portions of the square canvas.

The source artwork should remain LARGE, SUBSTANTIAL, and VISUALLY
DOMINANT.

Do NOT shrink the artwork excessively merely to create bottom typography
space.

Do NOT create the appearance of a small illustration floating above a
large blank page.

Use the available width naturally.

Allow meaningful source elements to extend broadly toward the left and
right sides when the original composition naturally supports this.

Do not pull peripheral source elements inward merely to create equal
margins.

Do not force the artwork away from the canvas edges if broader spatial
presence is natural to the source.

The final placement should feel like a professionally recomposed cover,
not a centered sticker placed above an empty area.

==================================================
5. BOTTOM TYPOGRAPHY STAGING REGION
==================================================

Create useful natural negative space within approximately the lower
25-28% of the canvas for future TITLE and SUBTITLE typography.

This percentage describes the approximate typography opportunity region.
It does NOT define a rigid empty horizontal strip.

Do NOT generate:
- text
- letters
- words
- numbers
- pseudo-text
- placeholder text
- typography

The TITLE and SUBTITLE will be added later by an external editor.

The strongest typography opportunity should generally exist around the
LOWER-CENTRAL portion of the cover.

Provide enough calm negative space for:
- a large future TITLE
- a smaller future SUBTITLE
- comfortable breathing room

However:
THE TYPOGRAPHY REGION IS NOT A DECORATION-FREE ZONE.

The typography region must remain READABLE, not EMPTY.

Do NOT clear the entire lower-central region of all visual activity.
Do NOT create an obvious blank rectangle.
Do NOT create an obvious blank horizontal band.
Do NOT create an artificially sterilized area whose shape reveals exactly
where future typography will be placed.

The viewer should NOT be able to identify the future typography area
solely because decoration suddenly disappears there.

==================================================
6. TYPOGRAPHY SPACE SHOULD EMERGE NATURALLY
==================================================

Typography space should EMERGE FROM THE COMPOSITION.

Do not manufacture typography space by removing all nearby visual
activity.

Instead, create usable typography space through:
- natural spacing
- controlled decoration density
- irregular negative-space pockets
- visual breathing room
- thoughtful separation between motifs

Think of the future typography as something that will later be layered
into naturally existing negative space.

Do NOT treat typography as something requiring a completely empty box.

The final illustration should look visually complete and natural even
before typography is added.

If the title and subtitle were never added, the bottom portion should
still feel intentionally composed rather than obviously unfinished.

==================================================
7. DECORATION MAY ENTER THE TYPOGRAPHY REGION
==================================================

Small, sparse, contextual decorative motifs MAY appear inside the broader
future TITLE and SUBTITLE region.

Do NOT visibly route decorations around the typography region.
Do NOT create a decoration-free hole in the composition.

Decoration may naturally pass through and occupy portions of the broader
typography region as long as sufficient uninterrupted negative space
remains available for future text.

Within the future typography region:
- allow occasional small motifs
- prefer light and isolated placement
- preserve generous spacing between motifs
- preserve larger continuous white pockets for actual typography
- allow motifs to appear between potential lines of typography
- allow motifs near the outer portions of the title region
- allow occasional tiny accents within broader title-space negative areas

However:
- avoid large motifs near the likely visual center of the TITLE
- avoid dense clusters
- avoid multiple overlapping motifs
- avoid horizontal chains of motifs
- avoid repeated motifs forming a pattern
- avoid placing many motifs directly behind the same future line of text

The goal is NATURAL COEXISTENCE between typography space and decoration.

Typography clearance must come from SPACING, not from complete decorative
exclusion.

==================================================
8. NO TYPOGRAPHY-SHAPED EMPTY ZONE
==================================================

DECORATION DISTRIBUTION MUST BE COMPOSITION-AWARE,
NOT TYPOGRAPHY-AVOIDANT.

The decoration system should respond to the whole cover composition.

It should NOT visibly bend around or outline an invisible typography box.

Avoid creating:
- a large blank rectangle
- a blank oval
- a blank horizontal stripe
- a blank central island
- symmetrical decoration surrounding an empty center
- decorative corners enclosing empty typography space
- a visible decoration boundary around the future title

The viewer should perceive natural negative space.
The viewer should NOT perceive an invisible title container.

==================================================
9. NEGATIVE SPACE IS IMPORTANT
==================================================

Empty space is a valid and important design element.

Do NOT attempt to fill every empty region.
Do NOT treat every empty area as an invitation to add decoration.

Preserve generous areas of clean white space when they improve the cover.

Negative space should remain visible and intentional.

The cover should feel premium, breathable, and professionally art-directed
rather than densely filled.

However:
SPARSE does NOT mean EMPTY.
READABLE does NOT mean EMPTY.
TYPOGRAPHY SPACE does NOT mean DECORATION-FREE.

Use negative space and decoration together.

The desired result is a lightly decorated composition containing natural
open pockets large enough for typography.

==================================================
10. LIGHT CONTEXTUAL DECORATION
==================================================

Add a LIGHT, SPARSE layer of contextual decorative motifs when safe
negative space is available.

Some decorative integration is generally desirable for a professionally
designed cover.

The target is:
LIGHTLY DECORATED,
not completely undecorated,
and not densely decorated.

Use a small number of carefully selected motifs distributed naturally
through suitable open areas.

Only omit decoration entirely when there is genuinely no safe or
compositionally useful negative space available.

Decorations must be derived from the actual FIRST PROVIDED IMAGE.

Analyze the source dynamically for:
- environment
- setting
- season
- weather
- activity
- objects
- existing visual motifs
- atmosphere
- mood
- thematic identity

Choose decorative motifs that genuinely belong to that visual world.

Do NOT use a fixed decoration vocabulary.
Do NOT automatically add generic:
- stars
- hearts
- flowers
- clouds
- sparkles
- dots
- leaves
- birds
- snowflakes
unless those motifs are contextually appropriate to the ACTUAL source
image.

Do NOT add decorations merely because they are cute.
Do NOT introduce unrelated objects.
Do NOT borrow decorative motifs from previous examples or previous source
images.

The decoration vocabulary must adapt independently to each new source
image.

==================================================
11. DECORATION DENSITY TARGET
==================================================

Decoration should be VISIBLY PRESENT but CLEARLY SUBORDINATE.

Avoid BOTH extremes:

EXTREME A:
A completely undecorated or artificially empty cover when safe contextual
decoration would improve visual integration.

EXTREME B:
An overly decorated cover where secondary motifs compete with the source
artwork or consume too much negative space.

The desired result is LIGHTLY DECORATED.

Prefer a few well-placed motifs over many small scattered motifs.

The viewer should notice:
FIRST:
the SOURCE ARTWORK.
SECOND:
the overall cover composition.
THIRD:
the decorative accents.

Do NOT attempt full-canvas decorative coverage.
Do NOT decorate every quadrant.
Do NOT place decoration simply to balance another decoration.
Do NOT force symmetry.
Do NOT fill every empty pocket.

But also:
Do NOT stop decoration abruptly when reaching the future typography
region.

Allow the decoration rhythm to continue naturally into and through the
broader bottom region at a controlled density.

==================================================
12. DECORATION DISTRIBUTION
==================================================

Decoration should feel distributed across the COVER as a whole rather
than divided into:
"decorated artwork region"
and
"undecorated typography region."

Allow appropriate motifs to appear in safe negative-space pockets:
- above the source artwork
- beside the source artwork
- around peripheral source areas
- in transitional negative space
- below the source artwork
- within portions of the broader typography region
- toward lower-left space
- toward lower-right space
- occasionally within lower-central negative space when sufficiently
  separated from other motifs

The density may vary naturally from region to region.

Do NOT enforce equal coverage.
Do NOT enforce equal numbers of motifs in different areas.
Do NOT create a uniform decorative field.

The transition from artwork to bottom typography space should feel
GRADUAL and ORGANIC.

There should be no obvious point where decoration suddenly stops.

==================================================
13. DECORATION SCALE AND VISUAL WEIGHT
==================================================

Most newly generated decorative motifs should remain SMALL relative to
the main source artwork.

They should function as accents, not subjects.

Prefer:
- tiny contextual accents
- small simple motifs
- isolated thematic details
- subtle peripheral elements
- occasional slightly larger motifs only when genuinely justified

Inside or near the typography region, prefer the LIGHTER end of this
scale hierarchy.

Do NOT introduce:
- large invented foreground objects
- large environmental clusters
- large decorative landscapes
- large decorative scenery
- dense object groups
- decorative scenes that compete with the source artwork

Do not build a second scene around or below the source artwork.

==================================================
14. ORGANIC DECORATION PLACEMENT
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
- artificial bilateral symmetry
- evenly balanced decoration
- decorative borders

It is acceptable for one side to contain more decoration than another.
It is acceptable for some areas to contain no decoration.

Decorations may appear near canvas edges when appropriate.
Decorations may appear inside the broader typography region.

Do not create a ring of decoration around the source artwork.
Do not create a ring of decoration around the typography area.
Do not deliberately place motifs around the perimeter of an invisible
title box.

The distribution should feel naturally scattered while remaining
professionally art-directed.

==================================================
15. BOTTOM-AREA DECORATION CONTROL
==================================================

The lower portion of the cover requires balanced handling.

Do NOT completely sterilize the lower region.
Do NOT fill the lower region with decorative scenery.

Instead, maintain a LIGHT CONTINUATION of the overall decorative rhythm
through the bottom region.

Small contextual motifs may appear:
- near lower peripheral areas
- near bottom corners
- within transitional spaces
- inside portions of the broader typography region
- between potential typography lines when sufficient spacing exists
- occasionally near the lower-center when they remain small and isolated

Good bottom-area decoration should:
- remain relatively small
- preserve substantial white space
- visually connect with the source theme
- soften the transition between artwork and typography
- create organic rhythm
- leave usable text space between motifs
- avoid becoming a foreground environment

Do NOT create large decorative clusters at both bottom corners merely to
fill space.
Do NOT automatically place matching decoration on the left and right.
Do NOT create symmetrical bottom-corner anchors.
Do NOT construct a decorative floor across the bottom.
Do NOT construct a decorative ceiling above the typography.
Do NOT create a decorative frame around the typography.

==================================================
16. DO NOT BUILD NEW ENVIRONMENTAL SCENERY
==================================================

Decoration must remain decoration.

Do NOT transform decorative accents into a newly invented foreground,
background, or secondary environment.

Do NOT invent large:
- plants
- bushes
- rocks
- clouds
- terrain
- snowbanks
- waves
- foliage
- architecture
- landscape masses
merely to fill available space.

If environmental motifs are genuinely derived from the source and are
used as new decoration, simplify them into SMALL ACCENT-LIKE motifs.

Do not allow them to become major compositional masses.

The original source illustration must remain the only major scene.

==================================================
17. DECORATION MUST YIELD TO THE SOURCE
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
- where it could visually become part of an original source relationship

If a decorative element conflicts with the source:
REMOVE THE DECORATIVE ELEMENT.

Do NOT move, shorten, erase, redirect, or redraw the source element.

Decoration must adapt to the source.
The source must NEVER adapt to decoration.

==================================================
18. DECORATION STYLE
==================================================

All newly generated decorative motifs must match the original
illustration's visual language.

Use:
- simple black outlines
- clean contours
- white interiors
- coloring-book-friendly shapes
- consistent line-art character
- similar visual simplicity to the source

New decoration should look as though it naturally belongs to the same
illustrated world as the original artwork.

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

Do not make decoration visually heavier than comparable small elements
inside the original artwork.

==================================================
19. BORDERLESS COVER
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
20. COLORING-BOOK STYLE
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
21. VISUAL HIERARCHY
==================================================

The final composition contains THREE visual systems:
1. SOURCE ARTWORK
2. NATURAL NEGATIVE SPACE FOR TYPOGRAPHY
3. LIGHT CONTEXTUAL DECORATION

Their hierarchy is:
SOURCE ARTWORK
>
TYPOGRAPHY READABILITY
>
DECORATION

IMPORTANT:
This hierarchy controls VISUAL IMPORTANCE.
It does NOT define spatial exclusivity.

Typography space does NOT require decoration-free territory.
Negative space and light decoration may spatially coexist.

The broader typography region may contain small decoration as long as
sufficient natural white space remains for future text.

Do not solve typography readability by eliminating all decoration.
Do not solve decoration balance by filling every empty region.
Do not solve composition balance by centering everything.
Do not solve visual balance through symmetry.

==================================================
22. COMPOSITION PRIORITY
==================================================

When instructions conflict, follow this priority:
1. Preserve the original artwork faithfully.
2. Preserve all original source relationships and connections.
3. Preserve original proportions and structure.
4. Preserve the natural spatial extent of the source artwork.
5. Keep the source artwork large and visually dominant.
6. Preserve the source composition's natural visual gravity.
7. Create naturally usable lower-region negative space for future TITLE
   and SUBTITLE.
8. Do NOT turn the typography region into a decoration-free blank zone.
9. Preserve intentional negative space.
10. Allow light contextual decoration to naturally continue through the
    broader bottom region.
11. Maintain enough uninterrupted white space between decorations for
    future typography.
12. Prevent decoration from becoming a second scene.
13. Maintain natural visual integration across the full cover.
14. Remove the original border.
15. Never generate text.

==================================================
23. FINAL INTERNAL CHECK
==================================================

Before producing the final image, verify:

SOURCE:
- The original illustration remains immediately recognizable.
- Important characters, animals, objects, and environmental elements are
  preserved.
- Original proportions are preserved.
- Original spatial relationships are preserved.
- Original overlapping relationships are preserved.
- Meaningful source connections remain continuous.
- No source connection has been deleted.
- No source connection has been shortened.
- No source connection has been redirected.
- No source connection has been attached to newly generated decoration.
- No important source element has been redesigned.

COMPOSITION:
- The canvas is exactly 1:1.
- The source artwork occupies primarily the upper and upper-middle
  composition.
- The artwork remains large and visually dominant.
- The artwork has not been unnecessarily shrunk.
- The artwork does not look like a small floating sticker.
- The artwork is not unnecessarily compressed toward the center.
- The artwork retains its natural horizontal and vertical presence.
- Peripheral source elements have not been pulled inward merely to create
  equal margins.
- The composition does not rely on artificial symmetry.
- The lower region provides useful future TITLE and SUBTITLE space.
- The bottom region feels integrated with the overall cover.
- There is NO obvious blank rectangle reserved for typography.
- There is NO obvious blank horizontal strip reserved for typography.
- The cover still looks naturally composed without typography.

TYPOGRAPHY REGION:
- Future TITLE and SUBTITLE remain feasible.
- Sufficient uninterrupted negative-space pockets exist for typography.
- The typography region is readable but not artificially empty.
- Small decorations may exist within the broader typography region.
- Decoration has not been deliberately routed around the typography.
- The future typography region cannot be identified solely from the
  absence of decoration.
- No banner, box, panel, frame, or enclosing structure exists.
- Decoration does not form an invisible frame around future typography.

DECORATION:
- A light contextual decoration layer is present when safe negative space
  allows it.
- The result is lightly decorated rather than densely decorated.
- The result is not unnecessarily undecorated.
- Decoration is derived from the actual source image.
- Decoration does not use a fixed generic vocabulary.
- Decoration occupies only suitable negative-space pockets.
- Most decorative motifs remain small.
- Large areas of clean white space remain visible.
- Decoration may naturally continue into the bottom typography region.
- Decoration does not abruptly stop at an invisible typography boundary.
- Decoration does not cover source elements.
- Decoration does not touch or interrupt important source connections.
- Decoration does not visually merge with important source structures.
- Decoration does not form a repeating pattern.
- Decoration does not form a border.
- Decoration does not form a foreground scene.
- Decoration does not create large artificial environmental clusters.
- Decoration does not compete with the source artwork.
- Bottom decoration remains light and naturally distributed.
- Bottom decoration does not form symmetrical corner clusters.
- Bottom decoration does not create a decorative floor.
- Bottom decoration does not create a decorative frame around typography.

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

==================================================
24. FINAL DECISION RULE
==================================================

When deciding whether and where to add decoration, follow this rule:

If safe negative space exists and a small source-derived motif would help
the artwork, surrounding space, and future typography feel like one
professionally designed cover:
ADD A LIGHT DECORATIVE ACCENT.

This remains true even when that safe negative space lies within the
broader future typography region.

If a decoration would interfere with the source artwork:
REMOVE IT.

If a decoration would make future typography significantly difficult to
read:
MOVE IT TO ANOTHER SAFE NEGATIVE-SPACE POCKET, SIMPLIFY IT, OR REMOVE IT.

If a decoration would become a major object or create a second scene:
SIMPLIFY IT OR REMOVE IT.

If several decorations would work equally well:
USE FEWER.

But do NOT interpret "use fewer" as "create a completely empty typography
zone."

The typography area must remain READABLE, NOT EMPTY.
Decoration should NOT avoid typography space.
Decoration and typography space should coexist through natural spacing.

SOURCE FIDELITY COMES FIRST.
TYPOGRAPHY USABILITY COMES SECOND.
DECORATION SUPPORTS AND CONNECTS THE COMPOSITION.

==================================================
25. TARGET VISUAL RESULT
==================================================

The final cover should feel like ONE naturally composed illustration.

It should NOT feel like:
"illustration on top + empty title box underneath."

Instead it should feel like:
"large faithful source artwork + naturally continuing sparse decoration
+ organically occurring negative space where typography can later be
placed."

Before typography is added, the cover should already look visually
complete.

After typography is added, the TITLE and SUBTITLE should naturally fit
into the existing negative-space structure without requiring the
illustration to be redesigned.

Generate ONE strictly 1:1 premium black-and-white coloring-book
BOTTOM COVER.`;

/** Where the clear title band sits, per position — used by the override below. */
const TITLE_BAND_LABEL: Record<TitleSafePosition, string> = {
  top: "the UPPER ~25% of the canvas",
  middle: "a horizontal band across the MIDDLE ~25% of the canvas",
  bottom: "the LOWER ~25% of the canvas",
};

/**
 * Overriding "clear title band" rule appended to every cover prompt. The
 * dedicated per-position prompts were tuned to preserve composition and
 * explicitly AVOID an empty band (e.g. "not an artificially empty band",
 * "decoration may enter the typography region"), which left no usable space for
 * the title to be added later. This block flips that for the title band ONLY:
 * keep it genuinely clear of DECORATION (real open space for typography) while
 * never moving or removing the main source characters/artwork to make room.
 * Cover-generation only.
 */
function titleClearspaceOverride(pos: TitleSafePosition): string {
  return `

==================================================
TITLE CLEARSPACE — OVERRIDING RULE (HIGHEST PRIORITY)
==================================================

This rule OVERRIDES any earlier guidance that allows decoration inside the
title region or that says the title area must not be empty.

Keep ${TITLE_BAND_LABEL[pos]} as a genuinely CLEAR, usable title band — real,
uncluttered open negative space where a large TITLE and a smaller SUBTITLE can
be added later and read comfortably.

- Keep DECORATION OUT of this band: no clouds, stars, flowers, hearts, dots,
  sparkles, or other motifs inside it. It must read as open space.
- Do NOT draw any box, rectangle, banner, ribbon, panel, frame, or border
  around it. Keep the edges organic — it is open space, not a container.
- Source fidelity still comes first: do NOT move, shrink, rearrange, or remove
  the main source characters, objects, or their structural connections to
  create this band. If the original composition naturally reaches into the
  band, keep the source art and remove only DECORATION, holding generous
  breathing room around the future title.
- Still NO literal text, letters, numbers, or placeholder typography.`;
}

/** Returns the dedicated, user-tuned prompt for a title position. */
function coverPromptFor(titleSafe: TitleSafePosition): string {
  switch (titleSafe) {
    case "top":
      return TOP_COVER_PROMPT;
    case "middle":
      return MIDDLE_COVER_PROMPT;
    case "bottom":
      return BOTTOM_COVER_PROMPT;
  }
}

export function buildCoverSourceBWPrompt(titleSafe: TitleSafePosition): string {
  // Dedicated per-position prompt. middle/bottom append the shared clear-title-
  // band override so a usable (decoration-free) title space is preserved. The
  // TOP prompt is self-contained — it governs its own top typography region
  // (which intentionally allows light peripheral decoration, sections 5/6/11),
  // so appending the blunt "decoration-free band" override would contradict it.
  const base = coverPromptFor(titleSafe);
  return titleSafe === "top" ? base : `${base}${titleClearspaceOverride(titleSafe)}`;
}

/** Per-position title-area rule for the compact variant. Must keep a genuinely
 * CLEAR band (real open space for the title added later), decoration OUT. */
const COMPACT_TITLE_ZONE: Record<TitleSafePosition, string> = {
  top: "Keep the UPPER ~25% of the canvas as a genuinely CLEAR, usable title band — real open negative space for a large title + subtitle. Keep decoration OUT of it.",
  middle: "Keep a horizontal band across the MIDDLE ~25% of the canvas as a genuinely CLEAR, usable title area — real open negative space. Keep decoration OUT of it.",
  bottom: "Keep the LOWER ~25% of the canvas as a genuinely CLEAR, usable title band — real open negative space for a large title + subtitle. Keep decoration OUT of it.",
};

/**
 * Compact variant of buildCoverSourceBWPrompt for providers with a hard prompt
 * limit (KingCong caps at 4000 chars; the full prompts run 17k–28k). Distills
 * the same contract — recomposition-not-redesign, source + structural lock,
 * per-position title area, sparse decoration, borderless, and the shared B&W /
 * no-text guard — into ~2.3k chars. Keep in sync with the full prompt's intent.
 */
export function buildCoverSourceBWPromptCompact(titleSafe: TitleSafePosition): string {
  return `Recompose the FIRST PROVIDED IMAGE into ONE premium 1:1 square coloring-book cover. This is a RECOMPOSITION, not a redesign.

PRESERVE THE SOURCE (highest priority): keep all characters, objects, poses, proportions, relative scale, cropping, perspective and composition faithful to the original — it must stay immediately recognizable as the same illustration. Do NOT invent, redesign, rearrange, center, shrink or enlarge the main artwork. Keep it large and visually dominant; let elements approach or extend past the edges as the original does.

PRESERVE STRUCTURAL CONNECTIONS: keep every rope, string, cable, handle, strap, stem, support and connecting line attached to the correct objects. Never turn a structural line into decoration, and never let clouds/flowers/stars/hearts interrupt or attach to structural elements.

TITLE AREA: ${COMPACT_TITLE_ZONE[titleSafe]} Source fidelity first — do NOT move, shrink or remove the main characters to make room; if source art reaches into the band, keep it and clear only DECORATION, holding breathing room around the future title. No text.

DECORATION: add only a small amount of cute, on-theme decoration (clouds, stars, flowers, hearts, dots, sparkles) in the existing negative space. Keep it sparse, irregular, non-grid, secondary to the artwork, with generous calm negative space. Decoration must always yield to the source.

BORDERLESS: fill the full square canvas edge-to-edge; if the source has an outer border or frame, remove it and add none.${BW_GUARD}`;
}
