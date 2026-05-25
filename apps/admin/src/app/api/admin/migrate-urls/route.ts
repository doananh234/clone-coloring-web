import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Strips the CDN host prefix from all R2 URLs in Firebase,
 * converting "https://image.lagroups.org/assets/..." → "/assets/..."
 *
 * Processes: books, artStyles, coloringStyles, characters, locations
 */

const CDN_HOSTS = [
  "https://image.lagroups.org",
  "https://pub-", // catch any pub-xxx.r2.dev URLs
];

function stripCdnHost(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  for (const host of CDN_HOSTS) {
    if (url.startsWith(host)) {
      const idx = url.indexOf("/", host.length);
      if (idx >= 0) return url.slice(idx);
    }
  }
  // Already relative
  if (url.startsWith("/")) return url;
  // Relative without leading slash (e.g. "assets/...")
  if (url.startsWith("assets/")) return `/${url}`;
  return undefined; // not an R2 URL, leave unchanged
}

function stripUrlFields(
  data: Record<string, unknown>,
  fields: string[],
): Record<string, unknown> | null {
  const updates: Record<string, unknown> = {};
  let changed = false;

  for (const field of fields) {
    const val = data[field];
    if (typeof val === "string" && val.startsWith("http")) {
      const stripped = stripCdnHost(val);
      if (stripped && stripped !== val) {
        updates[field] = stripped;
        changed = true;
      }
    }
  }

  return changed ? updates : null;
}

function stripArrayUrls(
  arr: Array<Record<string, unknown>> | undefined,
  urlField: string,
): { updated: Array<Record<string, unknown>>; changed: boolean } | null {
  if (!arr?.length) return null;
  let changed = false;
  const updated = arr.map((item) => {
    const val = item[urlField];
    if (typeof val === "string" && val.startsWith("http")) {
      const stripped = stripCdnHost(val);
      if (stripped && stripped !== val) {
        changed = true;
        return { ...item, [urlField]: stripped };
      }
    }
    return item;
  });
  return changed ? { updated, changed } : null;
}

export async function POST() {
  try {
    const stats = { books: 0, artStyles: 0, coloringStyles: 0, characters: 0, locations: 0 };

    // --- Books ---
    const bookSnap = await adminDb.collection("books").get();
    for (const doc of bookSnap.docs) {
      const data = doc.data();
      const updates: Record<string, unknown> = {};
      let changed = false;

      // URL fields
      const fieldUpdates = stripUrlFields(data, [
        "coverUrl",
        "thumbnailUrl",
        "squareThumbnailUrl",
        "squareUrl",
        "pdfUrl",
        "tryoutPage",
      ]);
      if (fieldUpdates) {
        Object.assign(updates, fieldUpdates);
        changed = true;
      }

      // coloringPages[].url
      const cpResult = stripArrayUrls(data.coloringPages, "url");
      if (cpResult) {
        updates.coloringPages = cpResult.updated;
        changed = true;
      }

      // coloringPages[].coloredUrl
      if (data.coloringPages?.length) {
        const coloredResult = stripArrayUrls(data.coloringPages, "coloredUrl");
        if (coloredResult) {
          // Merge with existing coloringPages update
          const base = (updates.coloringPages || data.coloringPages) as Array<
            Record<string, unknown>
          >;
          updates.coloringPages = base.map((p, i) => ({
            ...p,
            ...(coloredResult.updated[i].coloredUrl !== data.coloringPages[i].coloredUrl
              ? { coloredUrl: coloredResult.updated[i].coloredUrl }
              : {}),
          }));
          changed = true;
        }
      }

      // summaryPages[].url
      const spResult = stripArrayUrls(data.summaryPages, "url");
      if (spResult) {
        updates.summaryPages = spResult.updated;
        changed = true;
      }

      if (changed) {
        updates.updatedAt = FieldValue.serverTimestamp();
        await doc.ref.update(updates);
        stats.books++;
      }
    }

    // --- Art Styles ---
    const artSnap = await adminDb.collection("artStyles").get();
    for (const doc of artSnap.docs) {
      const data = doc.data();
      const updates: Record<string, unknown> = {};
      let changed = false;

      const fieldUpdates = stripUrlFields(data, ["thumbnailUrl"]);
      if (fieldUpdates) {
        Object.assign(updates, fieldUpdates);
        changed = true;
      }

      // referenceImages[].url
      const refResult = stripArrayUrls(data.referenceImages, "url");
      if (refResult) {
        updates.referenceImages = refResult.updated;
        changed = true;
      }

      if (changed) {
        updates.updatedAt = FieldValue.serverTimestamp();
        await doc.ref.update(updates);
        stats.artStyles++;
      }
    }

    // --- Coloring Styles ---
    const csSnap = await adminDb.collection("coloringStyles").get();
    for (const doc of csSnap.docs) {
      const data = doc.data();
      const updates: Record<string, unknown> = {};
      let changed = false;

      const fieldUpdates = stripUrlFields(data, ["thumbnailUrl"]);
      if (fieldUpdates) {
        Object.assign(updates, fieldUpdates);
        changed = true;
      }

      const refResult = stripArrayUrls(data.referenceImages, "url");
      if (refResult) {
        updates.referenceImages = refResult.updated;
        changed = true;
      }

      if (changed) {
        updates.updatedAt = FieldValue.serverTimestamp();
        await doc.ref.update(updates);
        stats.coloringStyles++;
      }
    }

    // --- Characters ---
    const charSnap = await adminDb.collection("characters").get();
    for (const doc of charSnap.docs) {
      const data = doc.data();
      const fieldUpdates = stripUrlFields(data, ["referenceImageUrl", "thumbnailUrl"]);
      if (fieldUpdates) {
        fieldUpdates.updatedAt = FieldValue.serverTimestamp();
        await doc.ref.update(fieldUpdates);
        stats.characters++;
      }
    }

    // --- Locations ---
    const locSnap = await adminDb.collection("locations").get();
    for (const doc of locSnap.docs) {
      const data = doc.data();
      const fieldUpdates = stripUrlFields(data, ["referenceImageUrl", "thumbnailUrl"]);
      if (fieldUpdates) {
        fieldUpdates.updatedAt = FieldValue.serverTimestamp();
        await doc.ref.update(fieldUpdates);
        stats.locations++;
      }
    }

    const total =
      stats.books + stats.artStyles + stats.coloringStyles + stats.characters + stats.locations;

    return NextResponse.json({
      success: true,
      message: `Migrated ${total} documents`,
      stats,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
