/**
 * Reverse adapter: a Prisma row → the ORIGINAL Firestore document shape.
 * The single source of truth for BOTH the worker bulk reverse-sync script and
 * the admin "sync one book" route, so the written doc structure never diverges.
 */
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { type AnyRec, type SyncConfig, toTimestamp } from "./sync-config";

/**
 * Rebuild a Firestore doc from a Prisma row:
 *   - native columns (scalars/json) + data-overflow flattened back to top level
 *   - Prisma-only columns are NOT written (only what the config lists / data holds)
 *   - renames reversed (e.g. avatarUrl→photoUrl)
 *   - createdAt in the collection's native format (iso | Timestamp)
 *   - updatedAt set to serverTimestamp()
 */
export function toFirestoreDoc(cfg: SyncConfig, row: AnyRec): AnyRec {
  const doc: AnyRec = {};
  for (const col of cfg.scalars) if (row[col] != null) doc[col] = row[col];
  for (const col of cfg.json) if (row[col] != null) doc[col] = row[col];
  for (const [from, to] of Object.entries(cfg.rename ?? {})) if (row[to] != null) doc[from] = row[to];

  const overflow = (row.data as AnyRec | null) ?? {};
  for (const [k, v] of Object.entries(overflow)) {
    if (cfg.excludeFromData?.includes(k)) continue;
    doc[k] = v;
  }

  if (row.createdAt) {
    const d = new Date(row.createdAt as string | Date);
    doc.createdAt = cfg.createdAtFormat === "iso" ? d.toISOString() : Timestamp.fromDate(d);
  }
  doc.updatedAt = FieldValue.serverTimestamp();
  return doc;
}

/** Rehydrate ISO timestamps inside a { [bookId]: { ..., <tsField> } } map. */
export function reviveMap(map: AnyRec, tsField: string): AnyRec {
  const out: AnyRec = {};
  for (const [bookId, entry] of Object.entries(map)) {
    if (entry && typeof entry === "object") {
      const e = { ...(entry as AnyRec) };
      if (e[tsField] !== undefined) e[tsField] = toTimestamp(e[tsField]);
      out[bookId] = e;
    } else out[bookId] = entry;
  }
  return out;
}
