/**
 * Typography-overlay prompt for AI cover generation. Shared by:
 *   - Worker's stepGenerateCover (batch cover creation for cloned books)
 *   - Admin's /api/generate/cover-export (interactive AI-mode save from the
 *     cover editor)
 *
 * Given a CLEAN coloring-book illustration + a brand name (and optionally
 * title / subtitle hints), the prompt tells a vision-capable image-edit
 * model to:
 *   1. Analyze the illustration (mood, subject, audience, style).
 *   2. Pick a font pairing from the curated Google Fonts catalog.
 *   3. Use the provided hints — or invent title/subtitle if none.
 *   4. Render all three text roles per the Amazon-KDP-style typography spec,
 *      with the brand name locked verbatim.
 *
 * Model side: Diaflow's editImage / Gemini 2.x / GPT-4o with image edit.
 */

interface PromptHints {
  titleHint?: string;
  subtitleHint?: string;
}

export function buildCoverTypographyPrompt(brandName: string, hints?: PromptHints): string {
  const brand = brandName.trim() || "iroly";
  const titleHint = hints?.titleHint?.trim();
  const subtitleHint = hints?.subtitleHint?.trim();

  const titleSection = titleHint
    ? `TITLE
- Use exactly this title: "${titleHint}"
- If it doesn't quite match the illustration mood, tweak wording lightly but
  keep the same core concept and length (1–3 words).
- Do NOT append or include the words "Coloring Book" in the title — that
  belongs to the subtitle only.
- Render in ALL CAPS.`
    : `TITLE
- 1–3 words (hard max 4)
- ALL CAPS
- Emotional, memorable, evocative
- Do NOT include the words "Coloring Book" in the title — that belongs to
  the subtitle only.
- Broad enough to cover the whole coloring book, not just this one page`;

  const subtitleSection = subtitleHint
    ? `SUBTITLE
- Use exactly this subtitle: "${subtitleHint}"
- End with "Coloring Book" only if the hint already does; do not append it
  otherwise.
- Render in Title Case.`
    : `SUBTITLE
- 2–6 words (hard max 8)
- Describes what's inside the book
- End with "Coloring Book" when it reads naturally
- Use Title Case`;

  return `You are an expert Amazon KDP coloring-book cover designer with a strong
sense of typography.

You are given a coloring-book cover illustration WITHOUT ANY TEXT and a brand name.

Your job: analyze the illustration and add professionally designed typography.

===========================================
CRITICAL — PRESERVE THE ARTWORK PIXEL-FOR-PIXEL
===========================================

The input illustration MUST come through completely unchanged. This is a
TEXT-OVERLAY task, NOT an image-generation task.

- DO NOT redraw, regenerate, reinterpret, or "improve" the illustration.
- DO NOT change the composition, framing, zoom, crop, or aspect of the art.
- DO NOT move, resize, re-pose, or alter the character(s) or any object.
- DO NOT change colors, line weight, shading, or any artwork detail.
- Keep every pixel of the original illustration identical; only NEW text
  pixels may appear on top.

If you find yourself re-drawing the scene, STOP — you are doing it wrong.
Treat the illustration as a locked, flattened background layer.

===========================================
CRITICAL — ONE SINGLE VIEW
===========================================

The output is ONE image with the SAME single illustration as the input.
It is NOT a collage. It is NOT a grid. It is NOT a diptych or triptych.
It is NOT split into panels or before/after views. Do not duplicate the
artwork or add any additional panels.

The input is already borderless and full-bleed. Keep it that way — do
not add any decorative frame, page border, or colored margin.

===========================================
CRITICAL — NO BACKGROUND PLATE BEHIND TEXT
===========================================

Place the text DIRECTLY on the illustration. Do NOT add any solid or
semi-transparent colored shape behind or around the title, subtitle, or
brand — no band, banner, ribbon, box, rectangle, plate, header bar,
gradient strip, or darkened/blurred region to "help readability".

Readability MUST come ONLY from the text's own styling: white fill, a
thick black outline, and an optional soft drop shadow. If any rectangular
colored area appears behind the text, the result is WRONG — remove it and
let the artwork show through around every letter.

===========================================
CRITICAL — THREE TEXT ELEMENTS, ALL REQUIRED
===========================================

The output MUST contain THREE separate pieces of text:

  1. TITLE      — large, top center
  2. SUBTITLE   — medium, just below the title
  3. BRAND      — SMALL, bottom center, exactly "${brand}"

Do NOT skip the brand. Do NOT merge brand into the subtitle. If your output
has only two text elements, it is WRONG. Count text elements before finishing.

------------------------------------
STEP 1 — Understand the Illustration
------------------------------------

Silently identify:
- Main subject (character, animal, activity)
- Age range hint (toddler / kid / tween / teen / adult)
- Emotion (cozy, playful, adventurous, magical, spooky, calm)
- Environment (indoor cozy, outdoors, fantasy, nature, seasonal)
- Line-art style (chibi, kawaii, detailed, whimsical, mandala, retro)

Then produce:

${titleSection}

${subtitleSection}

BRAND
- Use exactly this brand name, VERBATIM, no substitutions: ${brand}
- Do NOT translate, abbreviate, or restyle the letters of the brand name.
- Do NOT skip or omit the brand line under any circumstances.

------------------------------------
STEP 2 — Choose Fonts From the Catalog
------------------------------------

Do NOT invent font families. Pick ONE font per role from the curated Google
Fonts catalog below. Match the illustration's mood.

DISPLAY / TITLE fonts:
  • Fredoka — friendly bubble, all-ages cozy kid (default fallback)
  • Bubblegum Sans — soft playful, chibi / kawaii
  • Bungee — bold blocky, adventure / comic
  • Righteous — retro-futuristic, sci-fi / dinosaur
  • Chewy — chunky playful, food / animals
  • Lobster — flowing bold script, food / vintage
  • Pacifico — surf beach vibe, summer / coastal
  • Kalam — marker-style, sketchbook / crafts

BODY / SUBTITLE fonts:
  • Nunito — warm rounded sans, kid-friendly (default fallback)
  • Comfortaa — soft round geometric, wellness / calm
  • Quicksand — light rounded, meditative / adult
  • Poppins — clean modern, contemporary
  • DM Sans — neutral clean, professional
  • Inter — clean neutral, minimalist

HANDWRITTEN / BRAND fonts:
  • Caveat — casual friendly handwriting (default fallback for brand)
  • Sacramento — cozy elegant script
  • Satisfy — playful bouncy script
  • Shadows Into Light — hand-drawn sketchbook feel
  • Amatic SC — thin display, artist notebook
  • Dancing Script — flowing calligraphy
  • Homemade Apple — marker-drawn
  • Gochi Hand — bold felt-tip
  • Patrick Hand — rounded printing
  • Indie Flower — warm doodle

Canonical font pairings by mood:
  • Cozy kids / farm / animals / cottage → Fredoka + Nunito + Caveat
  • Chibi / kawaii pastel → Bubblegum Sans + Comfortaa + Sacramento
  • Adventure / dinosaur / space → Bungee + Poppins + Gochi Hand
  • Whimsical fantasy / mermaid / fairy → Pacifico + Quicksand + Satisfy
  • Craft / sketchbook / journal → Kalam + Inter + Shadows Into Light
  • Retro / vintage / diner → Lobster + DM Sans + Homemade Apple

Bias toward the closest pairing. When in doubt, use "cozy kids".

------------------------------------
STEP 3 — Typography Rules
------------------------------------

TITLE
- Location: top center, occupying 70–85% of the page width.
- Never cover faces, eyes, or focal points.
- Style: picked DISPLAY font in bubble / rounded form, ALL CAPS, WHITE fill,
  THICK black outline (~3–5% of char height), optional soft drop shadow.
- MUST be the LARGEST text on the page.

SUBTITLE
- Location: immediately below the title.
- Style: picked BODY font, bold, ~40% the height of the title.
- Colors: highlight ONE descriptive keyword in warm yellow (#FFC83D), the
  remaining words WHITE, with a thin black outline on all letters.

BRAND (REQUIRED — DO NOT SKIP)
- Location: bottom center, resting near the bottom edge of the illustration.
- Style: picked HANDWRITTEN font, elegant but playful, colored dark navy (#2d2a3d).
- No outline needed.
- Never larger than 8% of the page height.
- Text: exactly "${brand}" — no spelling changes, no case changes, no spaces
  added or removed.

------------------------------------
STEP 4 — Layout
------------------------------------

Vertical order, top to bottom:
   TITLE
   SUBTITLE
   (illustration — untouched)
   BRAND

Generous spacing between rows. Never overlap character faces, eyes, or focal
points.

Feel: professionally published bestselling Amazon KDP coloring-book cover —
clean, warm, on-shelf-worthy, and immediately readable at thumbnail size.

------------------------------------
OUTPUT
------------------------------------

Return the illustration with all THREE text elements (title, subtitle,
brand) composited on top. The illustration itself must be identical to the
input aside from the text overlays.

FINAL CHECK before returning:
  1. Is the illustration IDENTICAL to the input (same composition, framing,
     zoom, character pose, and colors)? If the artwork was redrawn, recropped,
     zoomed, or altered in any way, discard and redo — overlay text only.
  2. Is there any colored band / banner / box / plate / strip behind the
     title, subtitle, or brand? If yes, remove it — text sits directly on the
     artwork, readability from outline + shadow only.
  3. Is the output ONE single illustration filling the whole square? If it
     looks like a collage / grid / diptych / before-after / multi-panel
     layout, discard and redo with a single view.
  4. Does the output contain the brand "${brand}" at the bottom? If not,
     add it.
  5. Are all three text elements (title, subtitle, brand) present and
     positioned per the spec? If any is missing, add it.
  6. Does the title avoid the words "Coloring Book"? If it includes them,
     remove them from the title (they belong to the subtitle).`;
}

/**
 * Compact variant of buildCoverTypographyPrompt for providers that cap the
 * prompt length (KingCong: 4000 chars). Same contract — overlay-only, three
 * text elements, no plate behind text — condensed to ~1.9k chars so it isn't
 * tail-truncated (which would drop the FINAL CHECK / brand rules). Drops the
 * full font catalog, keeping one default font per role.
 */
export function buildCoverTypographyPromptCompact(brandName: string, hints?: PromptHints): string {
  const brand = brandName.trim() || "iroly";
  const titleHint = hints?.titleHint?.trim();
  const subtitleHint = hints?.subtitleHint?.trim();

  const title = titleHint
    ? `exactly "${titleHint}" (ALL CAPS; tweak wording only slightly if needed; never add the words "Coloring Book")`
    : `1–3 words, ALL CAPS, evocative; never the words "Coloring Book"`;
  const subtitle = subtitleHint
    ? `exactly "${subtitleHint}" (Title Case)`
    : `2–6 words, Title Case, describes the book, end with "Coloring Book" when it reads naturally`;

  return `Amazon KDP coloring-book cover typographer. You get a TEXT-FREE illustration + a brand. Overlay professional typography ONLY.

PRESERVE ARTWORK: text-overlay task, NOT image generation. Keep every pixel of the illustration identical — do NOT redraw, recolor, recrop, zoom, move, or re-pose anything. Only new text pixels may appear on top.

SINGLE VIEW: output is ONE image, the same single illustration. No collage/grid/diptych/panels; no added frame/border/margin (keep it full-bleed).

NO PLATE BEHIND TEXT: place text directly on the art. No band/banner/box/ribbon/strip/gradient behind title, subtitle, or brand. Readability comes ONLY from white fill + thick black outline (+ optional soft shadow).

THREE TEXT ELEMENTS (all required — count before finishing):
1. TITLE — top center, LARGEST text, ${title}. Style: friendly rounded/bubble display font (default Fredoka), WHITE fill + thick black outline, ~70–85% of width, never covering faces/eyes.
2. SUBTITLE — just below title, ~40% of title height, ${subtitle}. Style: rounded sans (default Nunito), bold, WHITE with ONE keyword in warm yellow #FFC83D, thin black outline.
3. BRAND — bottom center, small (≤8% height), exactly "${brand}" VERBATIM (no case/spelling/spacing change, never omit). Style: playful handwritten font (default Caveat), dark navy #2d2a3d, no outline.

LAYOUT top→bottom: TITLE, SUBTITLE, (illustration untouched), BRAND. Generous spacing, never overlap focal points. Feel: clean, warm, bestselling KDP cover readable at thumbnail size.

FINAL CHECK: artwork identical to input? no colored plate behind any text? one single full-square view? brand "${brand}" present at bottom? all three text elements present? title free of the words "Coloring Book"? Fix any that fail.`;
}
