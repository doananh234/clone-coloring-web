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
TARGET STYLE & COLOR PALETTE
==================================================

${colorizationDirective}

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
