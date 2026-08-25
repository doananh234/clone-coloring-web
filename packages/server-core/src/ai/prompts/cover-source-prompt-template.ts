/**
 * Cover-Source Prompt Template
 *
 * Single combined image-to-image directive that BOTH colorizes a B&W coloring
 * page AND recomposes it into a book-cover-ready "cover source" artwork:
 *   - main illustration relocated to the lower 55–70% of the canvas,
 *   - a clean title-safe area in the upper 30–45% (kept readable, not empty),
 *   - a sparse, subtle background pattern derived from motifs already present
 *     in the original artwork.
 *
 * The output is text-free: NO title, subtitle, author, logo, or watermark —
 * typography is added later in the Cover editor (generateAiCover).
 *
 * NOTE: This deliberately does NOT reuse buildColorizationPrompt. That template
 * forbids repositioning and demands full-bleed "every pixel is illustration",
 * which directly contradicts the negative-space / recompose goal here. The
 * coloring-quality rules (palette fidelity, no white gaps inside shapes,
 * premium rendering) are re-expressed below, minus the anti-reposition rules.
 *
 * @param colorizationDirective style-specific palette / medium / mood rules,
 *   extracted from the source page (same directive colorizeImage receives).
 */
export function buildCoverSourcePrompt(colorizationDirective: string): string {
  return `You are a professional coloring-book cover designer and commercial children's illustration renderer.

TASK:
Transform the FIRST provided image (a coloring page) into a book-cover-ready "cover source" artwork. Preserve the original subjects, characters, objects, concept, mood, visual language, and line-art style. Recompose the artwork so the MAIN ILLUSTRATION occupies the lower 55–70% of the image, while the UPPER 30–45% becomes a clean, title-safe area. Then colorize the whole result in the target style below.

If additional reference images are provided, they show the TARGET COLORING STYLE — match their palette, shading, lighting, texture, and overall feel exactly. The first image is what you adapt; the others are style references only.

==================================================
PRESERVE THE ORIGINAL ARTWORK
==================================================

Keep the original:
- main subject(s), characters, objects, environment
- concept, mood, and overall composition intent
- line-art style, shape language, line weight, corner roundness
- character proportions and facial structure
- level of detail, cuteness/coziness, and aesthetic identity

DO NOT:
- switch to a different concept or an unrelated new scene
- change the main character(s) or invent large new characters
- remove important details
- change the subject matter or setting

The goal is to RE-COMPOSE the original coloring page into a cover layout, NOT to create a new artwork.

==================================================
TITLE-SAFE AREA (UPPER 30–45%)
==================================================

Reserve the upper 30–45% of the canvas as a title-safe area for a title, subtitle, and author/brand to be placed LATER (do NOT draw any text now).

This area must be:
- airy and open, with intentional negative space
- free of the main subject
- free of any large object
- free of high-contrast detail that would compete with a title
- free of complex lines running through the central zone where the title will sit

But it must NOT be completely, unnaturally empty — see the background-pattern rules below.

Imagine an invisible title-safe box in the CENTER of the upper area: keep the main subject, large motifs, dense detail, and strong horizontal lines out of it. Any pattern belongs near the edges/corners or very sparsely behind where the title will go.

==================================================
BACKGROUND PATTERN FROM THE ORIGINAL'S OWN MOTIFS
==================================================

Look at the original coloring page and identify its characteristic decorative / secondary motifs — e.g. flowers, leaves, stars, hearts, dots, sparkles, clouds, bubbles, small toys, food icons, paw prints, mushrooms, bows, fruits, or any tiny decorative objects that already appear naturally in the artwork.

Then:
- extract that visual language and simplify the motifs into small decorative elements
- scatter them SPARSELY across the upper title area as a light background pattern
- make them feel drawn from the SAME world as the illustration

Do not use generic, unrelated patterns when the original already provides suitable motifs.

The pattern must stay VERY LIGHT and supportive:
- small motif size, wide spacing, natural (not industrial-wallpaper) distribution
- much lower visual density than the main illustration
- thinner lines, smaller scale, fewer details, lower contrast than the main art
- no large clusters directly behind the title, no large objects
- but always the SAME visual style as the original

==================================================
MAIN ILLUSTRATION (LOWER 55–70%)
==================================================

Move the visual center of gravity downward. Keep the main illustration in the lower 55–70% of the cover:
- do not crop out the character or any important object
- do not make the main subject too small
- keep it large enough to read as a thumbnail and to convey the coloring book's concept
- keep the rich level of detail of the original source

The transition between the upper title area and the lower illustration must be natural — no hard dividing line.

You MAY, only as needed for a better cover composition: expand/outpaint the canvas and background, gently reposition or scale groups of objects, and lift some decorative elements up into the background pattern. Everything you add must match the original's line weight, shape language, detail level, and stroke quality — as if drawn by the same illustrator in the same artwork. Never let outpainted regions look like a different AI style pasted in.

==================================================
TARGET STYLE & COLOR PALETTE
==================================================

${colorizationDirective}

==================================================
COLORING QUALITY
==================================================

- Colorize fully in the target style: rich, saturated, fully-opaque fills like a printed coloring-book cover — do not fade, pastel-ize, or desaturate unless the reference itself is a wash.
- Match the reference's tonal contrast: deep shadows, bright highlights, no flat mid-gray.
- Every enclosed shape fully filled: NO white gaps near outlines, NO unpainted edges, NO color bleeding outside lines, NO unfinished regions.
- Crisp, clean, anti-aliased edges; smooth cohesive shading; one unified rendering style across the whole image.

==================================================
DO NOT GENERATE
==================================================

- any text: title, subtitle, author name, logo, brand, fake typography, random letters, or watermark
- washed-out / low-contrast / flat / muddy colors, gray shadows, neon, blurry or rough textures
- inconsistent shading or lighting, unfinished regions, AI artifacts
- a collage, grid, or multi-panel layout
- a completely empty or blank upper area
- a hard horizontal divider between the title area and the illustration

==================================================
FINAL OUTPUT
==================================================

A single, professionally-rendered coloring-book COVER SOURCE that reads as the ORIGINAL illustration naturally adapted for a cover: the main artwork stays the focal point in the lower 55–70%, the upper 30–45% is a clean title-safe area holding only a subtle, on-brand background pattern, and there is NO text anywhere. Ready for a designer to drop a large title on top.`;
}

/**
 * Compact variant of buildCoverSourcePrompt for providers with a hard prompt
 * limit (KingCong caps at 4000 chars; the full prompt runs ~6.4k plus the
 * directive). Distills the same contract — recompose-not-recreate, preserve the
 * source, lower-55–70% illustration + upper-30–45% title-safe area, sparse
 * on-brand background pattern from the original's own motifs, colorize in the
 * target style, no text. Keep in sync with the full prompt's intent.
 */
export function buildCoverSourcePromptCompact(colorizationDirective: string): string {
  return `You are a professional coloring-book cover designer. Transform the FIRST image (a coloring page) into a book-cover-ready "cover source": RE-COMPOSE it (do not create a new artwork) and colorize it in the target style below.

If other images are provided they are TARGET-STYLE references only — match their palette, shading, lighting and feel exactly. The first image is what you adapt.

PRESERVE: the original subject(s), characters, objects, concept, mood, line-art style, shape language, line weight, proportions and detail. Do NOT switch concept, change or invent main characters, or remove important details.

LAYOUT:
- MAIN ILLUSTRATION in the lower 55–70% — large enough to read as a thumbnail, keep its rich detail, do not crop the character or shrink it too small.
- TITLE-SAFE upper 30–45%: airy and open, free of the main subject, large objects and high-contrast detail (a title is added later — draw NO text). It must NOT be unnaturally empty.
- The transition between the two must be natural — no hard dividing line.

BACKGROUND PATTERN: identify the original's OWN decorative motifs (flowers, stars, hearts, dots, sparkles, clouds, etc.), simplify them and scatter them SPARSELY and lightly across the upper area — small, widely spaced, thin, low-contrast, from the same visual world as the illustration; no large clusters behind the title. You may gently outpaint or reposition for a better cover, matching the original's line weight and style exactly.

TARGET STYLE & PALETTE:
${colorizationDirective}

COLORING: rich, saturated, fully-opaque fills; deep shadows and bright highlights, no flat mid-gray; every enclosed shape filled with no white gaps or bleeding; crisp edges; one unified style.

DO NOT: any text/title/logo/watermark; washed-out/flat/muddy/neon colors; collage or grid; a hard divider; a completely empty upper area.`;
}
