import type { EntityRecord } from "../../data/use-entity";

/** Meta / url / structural keys never shown or edited as free fields. */
export const SKIP = new Set([
  "id", "name", "displayName", "description", "createdAt", "updatedAt", "sourceBookId",
  "thumbnailUrl", "logoUrl", "referenceImageUrl", "referenceImages", "coloringStyleId",
  "index", "isPublic", "tags", "data", "__v",
]);

export function humanize(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

/** For DETAIL: string + string[] fields worth showing (excludes meta/urls). */
export function displayFields(obj: EntityRecord): { key: string; value: string | string[] }[] {
  const out: { key: string; value: string | string[] }[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (SKIP.has(k)) continue;
    if (typeof v === "string" && v.trim()) out.push({ key: k, value: v });
    else if (Array.isArray(v) && v.every((x) => typeof x === "string") && v.length) out.push({ key: k, value: v as string[] });
  }
  return out;
}

/** For EDIT: string-valued fields only (arrays/objects left untouched). */
export function editableStringFields(obj: EntityRecord): string[] {
  return Object.entries(obj)
    .filter(([k, v]) => !SKIP.has(k) && typeof v === "string" && v.trim())
    .map(([k]) => k);
}
