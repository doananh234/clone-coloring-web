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
  "category", "categoryId", "badge", "backgroundColor", "isPublic",
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

export function toBookPayload(patch: BookPatch): Record<string, unknown> {
  return pick(patch as Record<string, unknown>, BOOK_COLS);
}

export function toEntityPayload(kind: string, patch: EntityRecord): Record<string, unknown> {
  return pick(patch, new Set(ENTITY_COLS[kind] ?? ["name", "description"]));
}
