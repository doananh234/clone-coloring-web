/**
 * Maps a UI patch to a payload the real PUT endpoints accept.
 *
 * Every entity PUT does `prisma.update({ data: body-minus-id })`, so body keys
 * must be real columns or Prisma throws. We whitelist known columns and DROP
 * anything else (e.g. book.isPremium, character.description, brand.tags) — those
 * live in the `data` JSON blob and can't be set via a raw update without merging
 * (which would clobber the blob). Dropping is the safe, non-destructive choice.
 */
import type { BookPatch } from "./local-books";
import type { EntityRecord } from "./use-entity";

const BOOK_COLS = new Set([
  "title", "subtitle", "description", "price", "originalPrice", "discount",
  "category", "categoryId", "badge", "backgroundColor", "tryoutPage",
  "coverUrl", "pdfUrl", "thumbnailUrl", "squareThumbnailUrl", "niche", "isPublic",
]);

// Not Book columns — merged into Book.data (non-destructively) by the PUT route.
const BOOK_DATA_FIELDS = new Set([
  "isPremium", "isConverted", "isRedesigned", "isEditionConverted",
  "tags", "primaryColor", "secondaryColor", "themeStyle", "holiday", "occasion",
  "specifications", "etsyListing",
]);

const ENTITY_COLS: Record<string, string[]> = {
  characters: ["name", "type", "role", "characterPrompt", "tags", "referenceImageUrl"],
  locations: ["name", "description", "visualDescription", "locationPrompt", "atmosphere", "props", "tags", "referenceImageUrl"],
  "art-styles": ["name", "description", "thumbnailUrl", "lineWork", "composition", "formAndShape", "moodAndAtmosphere", "patternAndTexture", "technical", "generationDirective", "tags"],
  "coloring-styles": ["name", "description", "thumbnailUrl", "medium", "colorPalette", "shadingAndLighting", "fillBehavior", "overallFeel", "colorizationDirective", "tags"],
  brands: ["name", "displayName", "description", "logoUrl", "isPublic"],
  categories: ["name", "description"],
};

function pick(obj: Record<string, unknown>, cols: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (cols.has(k)) out[k] = v;
  return out;
}

/** Fields present in the patch that were dropped (not columns) — for logging/UX. */
export function droppedKeys(kind: "book" | string, patch: Record<string, unknown>): string[] {
  const cols = kind === "book" ? BOOK_COLS : new Set(ENTITY_COLS[kind] ?? ["name", "description"]);
  return Object.keys(patch).filter((k) => !cols.has(k));
}

/**
 * Split a book patch into real columns (top-level) + a `data` object holding the
 * blob fields. The PUT route merges `data` into the existing Book.data without
 * clobbering keys we didn't touch.
 */
export function toBookPayload(patch: BookPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (BOOK_COLS.has(k)) out[k] = v;
    else if (BOOK_DATA_FIELDS.has(k)) data[k] = v;
  }
  if (Object.keys(data).length > 0) out.data = data;
  return out;
}

export function toEntityPayload(kind: string, patch: EntityRecord): Record<string, unknown> {
  return pick(patch, new Set(ENTITY_COLS[kind] ?? ["name", "description"]));
}
