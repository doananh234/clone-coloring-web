/**
 * D1: hashtag normalization. Pure module (no "use client", no imports) so it is
 * safe to import into server routes via the @vx/coloring/data/tags subpath export.
 */

/** Normalize one raw tag: trim, lowercase, strip leading '#', whitespace/underscore
 *  runs → single hyphen, collapse/trim hyphens. Preserves unicode (Vietnamese).
 *  Returns "" when the tag normalizes to nothing. */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Normalize a list: map normalizeTag, drop empties, dedupe preserving first-seen order. */
export function normalizeTags(list: string[]): string[] {
  const out: string[] = [];
  for (const raw of list) {
    const t = normalizeTag(raw);
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Union of all tags across rows, normalized, deduped, sorted — the autocomplete pool. */
export function collectTags(items: { tags?: string[] }[]): string[] {
  const all: string[] = [];
  for (const it of items) if (Array.isArray(it.tags)) all.push(...it.tags);
  return normalizeTags(all).sort((a, b) => a.localeCompare(b));
}
