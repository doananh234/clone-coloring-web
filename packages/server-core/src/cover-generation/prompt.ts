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
- Render in ALL CAPS.`
    : `TITLE
- 1–3 words (hard max 4)
- ALL CAPS
- Emotional, memorable, evocative
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

DO NOT redraw the illustration.
DO NOT change colors, characters, or details of the artwork.
ONLY add text and remove any border.

===========================================
CRITICAL — FULL-BLEED, NO BORDER
===========================================

The output MUST be FULL-BLEED. The illustration fills the ENTIRE square
canvas from edge to edge, pixel to pixel.

Absolutely FORBIDDEN in the output:
- ❌ Any square or rectangular border, frame, or outline around the artwork
- ❌ Any thin colored line running along the outer edge of the canvas
- ❌ Any white / colored margin, padding, or gutter between the artwork and
     the canvas edge
- ❌ Any double frame or inner rim
- ❌ Any rounded-rectangle mask around the illustration

If the INPUT image contains ANY of the above (a decorative rim, a printed
frame, a page-margin gap), you MUST remove it by extending the illustration
or its background out to the four edges of the canvas. Do this BEFORE
adding any text. The pixels touching the canvas edge must be illustration
or its natural background — never a frame line, never a solid margin.

Zoom in and re-verify the four edges before finishing. If you see even a
1-pixel colored strip near an edge, extend the artwork further.

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

FINAL CHECK before returning (do all three):
  1. Does the output contain the brand "${brand}" at the bottom? If not,
     add it.
  2. Examine each of the four canvas edges one by one (top, right, bottom,
     left). Do you see a border line, rim, frame, or solid-color margin
     touching the edge? If yes on ANY edge, extend the artwork or its
     background out to that edge and re-check. The output must be
     completely full-bleed.
  3. Are all three text elements (title, subtitle, brand) present and
     positioned per the spec? If any is missing, add it.`;
}
