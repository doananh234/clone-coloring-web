import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { normalizeAssetPath } from "@vx/core-uikit/utils";

/**
 * Normalize every R2 image URL in Firestore to the canonical
 * "/assets/<rest>" shape.
 *
 *   POST /api/admin/migrate-urls?dryRun=1   → report only, no writes
 *   POST /api/admin/migrate-urls            → apply changes
 *
 * Handles legacy shapes:
 *   - "https://image.lagroups.org/assets/foo.png"  → "/assets/foo.png"
 *   - "https://pub-xxx.r2.dev/uuid/bar.png"        → "/assets/uuid/bar.png"
 *   - "assets/foo.png"                             → "/assets/foo.png"
 *   - "uuid/bar.png"                               → "/assets/uuid/bar.png"
 */

interface MigrationStats {
  scanned: number;
  changed: number;
  samples: Array<{ docId: string; field: string; from: string; to: string }>;
}

function emptyStats(): MigrationStats {
  return { scanned: 0, changed: 0, samples: [] };
}

function normalizeField(
  data: Record<string, unknown>,
  field: string,
): { value: string; changed: boolean } | null {
  const val = data[field];
  if (typeof val !== "string" || !val) return null;
  const normalized = normalizeAssetPath(val);
  if (!normalized || normalized === val) return null;
  return { value: normalized, changed: true };
}

function normalizeArrayField<T extends Record<string, unknown>>(
  arr: T[] | undefined,
  field: string,
): { value: T[]; changed: boolean } | null {
  if (!arr?.length) return null;
  let changed = false;
  const updated = arr.map((item) => {
    const val = item[field];
    if (typeof val !== "string" || !val) return item;
    const normalized = normalizeAssetPath(val);
    if (!normalized || normalized === val) return item;
    changed = true;
    return { ...item, [field]: normalized } as T;
  });
  return changed ? { value: updated, changed: true } : null;
}

async function migrateCollection(params: {
  collection: string;
  scalarFields: string[];
  arrayFields?: Array<{ arrayName: string; urlFields: string[] }>;
  dryRun: boolean;
  maxSamples?: number;
}): Promise<MigrationStats> {
  const { collection, scalarFields, arrayFields = [], dryRun, maxSamples = 5 } =
    params;
  const stats = emptyStats();
  const snap = await adminDb.collection(collection).get();

  for (const doc of snap.docs) {
    stats.scanned++;
    const data = doc.data();
    const updates: Record<string, unknown> = {};
    let docChanged = false;

    for (const field of scalarFields) {
      const result = normalizeField(data, field);
      if (!result) continue;
      updates[field] = result.value;
      docChanged = true;
      if (stats.samples.length < maxSamples) {
        stats.samples.push({
          docId: doc.id,
          field,
          from: String(data[field]),
          to: result.value,
        });
      }
    }

    for (const { arrayName, urlFields } of arrayFields) {
      const base = data[arrayName] as Array<Record<string, unknown>> | undefined;
      if (!base?.length) continue;
      let workingArray = base;
      let arrayChanged = false;
      for (const f of urlFields) {
        const result = normalizeArrayField(workingArray, f);
        if (!result) continue;
        workingArray = result.value;
        arrayChanged = true;
      }
      if (arrayChanged) {
        updates[arrayName] = workingArray;
        docChanged = true;
        if (stats.samples.length < maxSamples) {
          stats.samples.push({
            docId: doc.id,
            field: arrayName,
            from: `[array of ${base.length}]`,
            to: `[normalized: ${urlFields.join(", ")}]`,
          });
        }
      }
    }

    if (docChanged) {
      stats.changed++;
      if (!dryRun) {
        updates.updatedAt = FieldValue.serverTimestamp();
        await doc.ref.update(updates);
      }
    }
  }

  return stats;
}

async function migrateSingletonDoc(params: {
  collection: string;
  docId: string;
  arrayFields: Array<{ arrayName: string; urlFields: string[] }>;
  dryRun: boolean;
  maxSamples?: number;
}): Promise<MigrationStats> {
  const { collection, docId, arrayFields, dryRun, maxSamples = 5 } = params;
  const stats = emptyStats();
  const ref = adminDb.collection(collection).doc(docId);
  const snap = await ref.get();
  if (!snap.exists) return stats;
  stats.scanned = 1;

  const data = snap.data() as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  let docChanged = false;

  for (const { arrayName, urlFields } of arrayFields) {
    const base = data[arrayName] as Array<Record<string, unknown>> | undefined;
    if (!base?.length) continue;
    let workingArray = base;
    let arrayChanged = false;
    for (const f of urlFields) {
      const result = normalizeArrayField(workingArray, f);
      if (!result) continue;
      workingArray = result.value;
      arrayChanged = true;
    }
    if (arrayChanged) {
      updates[arrayName] = workingArray;
      docChanged = true;
      if (stats.samples.length < maxSamples) {
        stats.samples.push({
          docId,
          field: arrayName,
          from: `[array of ${base.length}]`,
          to: `[normalized: ${urlFields.join(", ")}]`,
        });
      }
    }
  }

  if (docChanged) {
    stats.changed = 1;
    if (!dryRun) {
      updates.updatedAt = FieldValue.serverTimestamp();
      await ref.update(updates);
    }
  }
  return stats;
}

export async function POST(req: NextRequest) {
  try {
    const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

    const results = {
      books: await migrateCollection({
        collection: "books",
        scalarFields: [
          "coverUrl",
          "thumbnailUrl",
          "squareThumbnailUrl",
          "squareUrl",
          "pdfUrl",
          "tryoutPage",
        ],
        arrayFields: [
          { arrayName: "coloringPages", urlFields: ["url", "coloredUrl"] },
          { arrayName: "summaryPages", urlFields: ["url"] },
        ],
        dryRun,
      }),
      artStyles: await migrateCollection({
        collection: "artStyles",
        scalarFields: ["thumbnailUrl"],
        arrayFields: [{ arrayName: "referenceImages", urlFields: ["url"] }],
        dryRun,
      }),
      coloringStyles: await migrateCollection({
        collection: "coloringStyles",
        scalarFields: ["thumbnailUrl"],
        arrayFields: [{ arrayName: "referenceImages", urlFields: ["url"] }],
        dryRun,
      }),
      characters: await migrateCollection({
        collection: "characters",
        scalarFields: ["referenceImageUrl", "thumbnailUrl"],
        dryRun,
      }),
      locations: await migrateCollection({
        collection: "locations",
        scalarFields: ["referenceImageUrl", "thumbnailUrl"],
        dryRun,
      }),
      categories: await migrateCollection({
        collection: "categories",
        scalarFields: ["iconUrl"],
        dryRun,
      }),
      cloneJobs: await migrateCollection({
        collection: "cloneJobs",
        scalarFields: ["sourcePdfUrl"],
        arrayFields: [
          { arrayName: "pages", urlFields: ["imageUrl", "redesignedUrl"] },
        ],
        dryRun,
      }),
      appHome: await migrateSingletonDoc({
        collection: "app",
        docId: "home",
        arrayFields: [
          { arrayName: "newArrivalBooks", urlFields: ["coverUrl"] },
          { arrayName: "trendingBooks", urlFields: ["imageUrl"] },
          { arrayName: "categories", urlFields: ["iconUrl"] },
          { arrayName: "freeColoringPages", urlFields: ["imageUrl"] },
        ],
        dryRun,
      }),
    };

    const totalScanned = Object.values(results).reduce(
      (acc, s) => acc + s.scanned,
      0,
    );
    const totalChanged = Object.values(results).reduce(
      (acc, s) => acc + s.changed,
      0,
    );

    return NextResponse.json({
      success: true,
      dryRun,
      message: dryRun
        ? `[dry-run] Would update ${totalChanged} of ${totalScanned} documents`
        : `Updated ${totalChanged} of ${totalScanned} documents`,
      totals: { scanned: totalScanned, changed: totalChanged },
      stats: results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
