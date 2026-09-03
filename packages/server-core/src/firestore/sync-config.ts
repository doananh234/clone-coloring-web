/**
 * Shared mapping config + value coercion for Firestore <-> Prisma sync.
 * Used by the worker sync scripts (forward + reverse) AND the admin
 * "sync one book to Firebase" route — a SINGLE source of truth so the doc
 * shape written back to Firestore never drifts between them.
 *
 * The reverse adapter reconstructs the ORIGINAL Firestore document shape, so it
 * must know: which columns are native (scalars/json), field renames, the native
 * `createdAt` format per collection, and which User.data keys belong to separate
 * aggregate collections (ownedBooks/savedBooks).
 */
import { Timestamp } from "firebase-admin/firestore";

export type AnyRec = Record<string, unknown>;

export interface SyncConfig {
  collection: string;
  /** Prisma delegate name on the client (e.g. "book"). */
  model: string;
  scalars: string[];
  json: string[];
  /** firestoreKey → prismaColumn */
  rename?: Record<string, string>;
  /** Native createdAt representation in Firestore (default: "timestamp"). */
  createdAtFormat?: "timestamp" | "iso";
  /** data-blob keys that live in a SEPARATE collection (skip on reverse). */
  excludeFromData?: string[];
  /** forward-only: derive extra Prisma columns from the raw Firestore doc. */
  compute?: (doc: AnyRec) => AnyRec;
}

/** Consumed on every doc so they never leak into `data`. */
export const ALWAYS_IGNORE = new Set(["id", "updatedAt"]);

export const CONFIGS: SyncConfig[] = [
  {
    collection: "books",
    model: "book",
    createdAtFormat: "iso",
    scalars: [
      "title", "subtitle", "description", "price", "originalPrice", "discount",
      "category", "categoryId", "badge", "backgroundColor", "tryoutPage",
      "coverUrl", "pdfUrl", "squareThumbnailUrl", "thumbnailUrl", "isPublic", "niche",
    ],
    json: ["summaryPages", "coloringPages"],
    compute: (d) => ({
      interiorPages: Array.isArray(d.coloringPages) ? d.coloringPages.length : null,
    }),
  },
  {
    collection: "categories",
    model: "category",
    scalars: ["name", "displayName", "description", "iconUrl", "iconPrompt", "isPublic", "index"],
    json: ["books"],
  },
  {
    collection: "characters",
    model: "character",
    scalars: ["name", "type", "role", "characterPrompt", "referenceImageUrl", "sourceBookId"],
    json: ["visualDna", "tags"],
  },
  {
    collection: "locations",
    model: "location",
    scalars: ["name", "description", "visualDescription", "locationPrompt", "referenceImageUrl", "sourceBookId"],
    json: ["atmosphere", "props", "tags"],
  },
  {
    collection: "artStyles",
    model: "artStyle",
    scalars: ["name", "description", "thumbnailUrl", "generationDirective", "sourceBookId"],
    json: [
      "referenceImages", "lineWork", "composition", "formAndShape",
      "moodAndAtmosphere", "patternAndTexture", "technical", "tags",
    ],
  },
  {
    collection: "coloringStyles",
    model: "coloringStyle",
    scalars: ["name", "description", "thumbnailUrl", "colorizationDirective", "sourceBookId"],
    json: [
      "referenceImages", "medium", "colorPalette", "shadingAndLighting",
      "fillBehavior", "overallFeel", "tags", "variants",
    ],
  },
  {
    collection: "cloneJobs",
    model: "cloneJob",
    createdAtFormat: "iso",
    scalars: [
      "name", "status", "sourceBookId", "sourceFileName", "sourcePdfUrl",
      "totalPages", "analyzedPages", "bookId", "resultBookId", "error",
    ],
    json: ["pages", "bookData", "entityMap"],
  },
  {
    collection: "purchases",
    model: "purchase",
    // Only fields genuinely present in Firestore purchase docs. Prisma-only
    // columns (amount/currency/provider/providerRef) have defaults/null and must
    // NOT be reverse-written or they'd add fields Firestore never had.
    scalars: ["userId", "bookId", "type", "status"],
    json: [],
  },
  {
    collection: "ledger",
    model: "creditLedger",
    // `description` is populated via the reason→description rename; keeping it in
    // scalars too would double-emit both keys on reverse.
    scalars: ["userId", "amount", "type"],
    json: [],
    rename: { reason: "description" },
  },
  {
    collection: "users",
    model: "user",
    // Firestore user docs have no email/role (role default "user" would leak on
    // reverse). Only photoUrl/displayName (renamed) + createdAt are native.
    scalars: [],
    json: [],
    rename: { photoUrl: "avatarUrl", displayName: "name" },
    // These live in user-libraries / user-saved-books, not the user doc.
    excludeFromData: ["ownedBooks", "savedBooks"],
  },
];

/** Look up the sync config for a collection (throws if unknown). */
export function configFor(collection: string): SyncConfig {
  const cfg = CONFIGS.find((c) => c.collection === collection);
  if (!cfg) throw new Error(`No Firestore sync config for collection "${collection}"`);
  return cfg;
}

// --- value coercion --------------------------------------------------------

export function isTimestamp(v: unknown): v is { toDate(): Date } {
  return (
    v instanceof Timestamp ||
    (typeof v === "object" && v !== null && typeof (v as AnyRec).toDate === "function")
  );
}

/** Timestamp | ISO string → Date (undefined when unparseable). */
export function toDate(v: unknown): Date | undefined {
  if (v == null) return undefined;
  if (isTimestamp(v)) return v.toDate();
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof v === "object" && typeof (v as AnyRec)._seconds === "number") {
    return new Date(((v as AnyRec)._seconds as number) * 1000);
  }
  return undefined;
}

/** Deep-convert a value for JSON storage: Firestore Timestamps → ISO strings. */
export function jsonSafe(v: unknown): unknown {
  if (v == null) return v;
  if (isTimestamp(v)) return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(jsonSafe);
  if (typeof v === "object") {
    const out: AnyRec = {};
    for (const [k, val] of Object.entries(v as AnyRec)) out[k] = jsonSafe(val);
    return out;
  }
  return v;
}

/** ISO-date detector for reverse hydration (YYYY-MM-DDTHH:MM:SS...Z). */
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Reverse of jsonSafe for a KNOWN timestamp field: ISO string → Firestore
 * Timestamp. Only converts strings that look like ISO datetimes.
 */
export function toTimestamp(v: unknown): unknown {
  if (typeof v === "string" && ISO_RE.test(v)) return Timestamp.fromDate(new Date(v));
  return v;
}
