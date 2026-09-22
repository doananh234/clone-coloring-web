/**
 * Prompt for redrawing one INTRO page of a coloring book (book.summaryPages):
 * either a title page, or a text-only utility page (copyright, legal notice,
 * table of contents, dedication, "this book belongs to").
 *
 * Deliberately separate from buildPageRegenPrompt(), which serves interior
 * coloring pages: that one preserves a scene and appends the KDP colouring
 * frame, both wrong here.
 *
 * The operator picks the variant in the regen dialog, so only the matching rule
 * set is built. The Diaflow prompt this replaces made the model classify the
 * page itself and then carried BOTH rule sets — 4007 chars, over KingCong's
 * 4000-char cap, so capPrompt() truncated the tail and dropped the text-page
 * rules entirely. Half of each request was text to be discarded anyway.
 *
 * No brand variable: an intro page stored on a Book was produced by the clone
 * pipeline with the brand already rendered into the image, so the prompt asks
 * for the copyright line to be copied from the source rather than substituting
 * a brand name (Book has no relation to Brand — the brand lives on CloneJob).
 *
 * Pure: no env reads, no DB access, no frame instruction.
 */

export type IntroPageVariant = "title" | "text";

export interface IntroRegenPromptOptions {
  /** Which rule set to build. Chosen by the operator in the regen dialog. */
  variant: IntroPageVariant;
  /** book.title — inlined so the model spells it right. Line omitted if blank. */
  title?: string;
  /** book.subtitle — line omitted if blank. */
  subtitle?: string;
  /** Variation budget for the title variant. Default 55. Unused for "text". */
  changePercent?: number;
}

const DEFAULT_CHANGE_PERCENT = 55;

export function buildIntroRegenPrompt(options: IntroRegenPromptOptions): string {
  return options.variant === "text" ? TEXT_PAGE_PROMPT : buildTitlePagePrompt(options);
}

/**
 * A title page: illustration plus title lettering. The variation budget is spent
 * on the illustration — the lettering treatment is pinned, because intro title
 * lettering normally has to match the cover, and image models misspell text they
 * are asked to redraw in a new style.
 */
function buildTitlePagePrompt({ title, subtitle, changePercent }: IntroRegenPromptOptions): string {
  const pct = changePercent || DEFAULT_CHANGE_PERCENT;
  const textLines = [
    title?.trim() ? `- Title: "${title.trim()}"` : "",
    subtitle?.trim() ? `- Subtitle: "${subtitle.trim()}"` : "",
    "- Copyright line: reproduce it word-for-word from the source image.",
  ]
    .filter(Boolean)
    .join("\n");

  return `This is the INTRO / TITLE page of a coloring book - not a printed cover, and not a page meant to be colored in. Redraw it as a refreshed variation (~${pct}% change). Output must be 1 single frame, never a split panel or grid.

TEXT - HIGHEST PRIORITY. Every word exactly as written, correctly spelled, fully legible, nothing cropped or overlapped:
${textLines}
Add no other words, taglines or placeholder text. Keep the original lettering treatment: same font style and weight, same outlined / bubble-letter look, same relative size and position.

KEEP: the vertical order (title top, illustration middle, descriptive text below, copyright bottom); generous white margins on all four sides, artwork must NOT bleed to the edges; black-and-white / grayscale only; the illustration's art style, rendering technique and level of shading; its subject and theme.

CHANGE: the characters' pose, viewing angle and arrangement; the props and decorative elements around them; background details, theme intact.

DO NOT: reword or shorten any text; drop the copyright line; add color, a barcode, an ISBN or a QR code; go full-bleed; flatten the illustration into blank line art with empty interiors.`;
}

/**
 * A text-only page. This is a reproduction task, not a variation: the wording is
 * legal or navigational, so there is nothing safe to redesign. The DO NOT block
 * is what stops the model turning a copyright page into an illustrated one.
 */
const TEXT_PAGE_PROMPT = `This is a text-only INTRO page of a coloring book (copyright, legal notice, table of contents, dedication, or "this book belongs to"). Reproduce it faithfully - this is NOT a creative variation, change as little as possible. Output must be 1 single frame.

TEXT - HIGHEST PRIORITY. Reproduce every text block from the source image: same wording, same order, same position, correctly spelled and fully legible. Do not omit, shorten, summarise or rephrase any sentence, including long legal paragraphs. Keep website URLs, email addresses and social handles character-for-character. Add no new words, headings or taglines.

KEEP: plain white page, black text, generous margins on all four sides; text blocks centered and stacked vertically with the same spacing; font family, weight, alignment and relative sizes; any logo or icon at its original position and size.

DO NOT: add a book title, subtitle or book name anywhere; add any illustration, character, animal, room, scene or background artwork; add a decorative frame, border or ornamental divider; convert any part into line art; reword or remove the legal paragraphs.`;
