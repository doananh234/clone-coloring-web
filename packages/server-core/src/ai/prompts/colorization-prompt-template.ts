/**
 * Colorization Prompt Template
 *
 * Fixed professional template + variable style injection.
 * The colorizationDirective provides style-specific rules (palette, medium, mood).
 * This template wraps it with critical control instructions (preserve lines, no gaps, quality).
 */

export function buildColorizationPrompt(colorizationDirective: string): string {
  return `You are a professional coloring book colorist and commercial children's illustration renderer.

TASK:
Colorize the FIRST provided image (the black-and-white coloring page) while STRICTLY preserving its original line art, composition, object placement, proportions, spacing, and readability.

If additional reference images are provided, they show the TARGET COLORING STYLE — match their color palette, shading technique, lighting, texture, and overall feel exactly. The first image is what you colorize; the other images are style references only.

==================================================
ABSOLUTE LINE ART PRESERVATION
==================================================

MANDATORY:
- NEVER redraw the artwork
- NEVER modify the outlines
- NEVER alter proportions
- NEVER change object placement
- NEVER remove details
- NEVER add new objects
- NEVER distort anatomy
- NEVER alter facial structure

Preserve the original black outline drawing EXACTLY.

==================================================
NO GAP / CLEAN FILL RULES
==================================================

CRITICAL:
Every enclosed shape must be FULLY colorized.

Requirements:
- NO white gaps near outlines
- NO unpainted edges
- NO color bleeding outside lines
- NO unfinished regions
- NO transparent edge artifacts
- NO mismatched fill regions
- Fill color completely to the outline edge

The coloring must feel perfectly polished and professionally finished.

==================================================
FULL-BLEED — EVERY PIXEL MUST BE ILLUSTRATION
==================================================

The output canvas must be 100% covered by the colored illustration. No
white, blank, or uncolored pixel is allowed anywhere — most especially not
near the edges where the input's border used to sit.

If the input page has a printed border, decorative frame, thin rim, or
white/colored margin around the illustration, do NOT simply erase it and
leave the vacated area white. That produces a white halo/ring around the
artwork and is WRONG.

Instead, do BOTH of the following:
  1. SCALE the illustration up (zoom in) so its own content — characters,
     objects, and background — reaches every side of the canvas. The
     illustration should bleed off the edges the way a printed full-bleed
     book cover does.
  2. EXTEND the illustration's own background color and texture outward
     into any remaining space so nothing near the edge stays white. The
     extended background must match the artwork's palette, lighting, and
     style — a seamless continuation, not a solid flat fill.

Never leave a white, cream, gray, or lightly-tinted strip, ring, or halo
along any side. Check each of the four edges before finishing: if any
edge shows a lighter band that doesn't belong to the illustration, redo
by zooming/extending further.

The output is ONE single view — not a collage, not a grid, not a diptych.

The final image should look like a full-bleed book cover: the artwork
touches every side of the canvas, with no printed frame, no page margin,
and no colored strip along any side.

==================================================
TARGET STYLE & COLOR PALETTE
==================================================

${colorizationDirective}

==================================================
COLOR FIDELITY (MATCH THE REFERENCE EXACTLY)
==================================================

If reference images are provided, the colored output MUST match their color
saturation, contrast, and vibrancy EXACTLY — sample the actual colors from the
reference, do not approximate.

MANDATORY:
- Reproduce the FULL saturation and richness of the reference — do NOT lighten,
  fade, pastel-ize, or desaturate the colors.
- Match the reference's tonal CONTRAST: keep deep, saturated shadows and bright
  highlights. Do not flatten the value range toward mid-gray.
- Fills must be fully opaque and vivid like a printed coloring-book cover, not
  a light watercolor wash (unless the reference itself is a wash).
- The result should look as saturated and punchy as the reference when placed
  side by side — a viewer must not be able to tell the recolor is "weaker".

==================================================
RENDERING QUALITY
==================================================

Render quality must resemble:
- premium commercial children's illustration
- polished digital painting
- bestselling coloring book cover
- high-end professional artwork

Edges:
- crisp
- anti-aliased
- clean

Shading:
- smooth
- cohesive
- consistent everywhere

Textures:
- subtle
- soft
- controlled

==================================================
STYLE CONSISTENCY
==================================================

The ENTIRE image must use ONE unified rendering style.

MANDATORY:
- same lighting style everywhere
- same shading strength everywhere
- same shadow softness everywhere
- same contrast everywhere
- same color harmony everywhere

No region should feel generated differently from another.

==================================================
NEGATIVE PROMPT
==================================================

Do NOT generate:
- washed-out tones
- low contrast
- flat lighting
- gray shadows
- neon colors
- blurry details
- rough textures
- inconsistent shading
- inconsistent lighting
- unfinished regions
- color bleeding outside lines
- white gaps inside shapes
- distorted anatomy
- AI artifacts
- muddy colors
- decorative page border or printed frame
- colored margin or rim along any side of the canvas
- white halo / white ring / white strip where the input's border used to be
- any uncolored, blank, cream, or lightly-tinted area near the canvas edge
- illustration floating in the middle with empty space around it
- collage / grid / multi-panel layout

==================================================
FINAL OUTPUT REQUIREMENTS
==================================================

The final image MUST look:
- professionally illustrated
- commercially publishable
- fully polished
- visually cohesive
- premium quality

MOST IMPORTANT:
- ZERO white gaps
- ZERO unfinished regions
- ZERO style inconsistency
- ZERO lighting inconsistency`;
}

/**
 * Compact variant of buildColorizationPrompt for providers with a hard prompt
 * limit (KingCong caps at 4000 chars; the full prompt runs ~6.1k plus the
 * directive). Distills the same contract — strict line-art preservation, clean
 * gap-free fills, full-bleed (no white border/halo), match the reference
 * saturation/contrast, one unified style. Keep in sync with the full prompt.
 */
export function buildColorizationPromptCompact(colorizationDirective: string): string {
  return `You are a professional coloring-book colorist. Colorize the FIRST image (a B&W coloring page) while STRICTLY preserving its line art, composition, placement, proportions and readability — never redraw, move, distort, add or remove anything.

If other images are provided they are TARGET-STYLE references only: match their palette, shading, lighting and contrast exactly (sample the real colors, do not approximate). The first image is what you colorize.

FILL: color every enclosed shape fully to the outline edge — no white gaps near lines, no bleeding outside lines, no unfinished regions.

FULL-BLEED: the colored illustration must cover 100% of the canvas. If the input has a printed border, frame or margin, do NOT erase it to white — instead scale the artwork up so its content reaches every edge AND extend its own background (matching palette and lighting) into any remaining space. No white/cream/gray strip, ring or halo on any side. One single view — not a collage or grid.

TARGET STYLE & PALETTE:
${colorizationDirective}

QUALITY: rich, fully-opaque, saturated fills like a printed coloring-book cover (not a faded wash unless the reference is one); deep shadows and bright highlights, no flat mid-gray; crisp anti-aliased edges; one unified lighting and shading style everywhere.

DO NOT: washed-out/low-contrast/flat/muddy/neon colors, gray shadows, blur, inconsistent shading, unfinished regions, white gaps inside shapes, distorted anatomy, decorative page border or frame, colored margin or white halo at any edge, an illustration floating with empty space around it, collage/grid, or ANY text or watermark.`;
}
