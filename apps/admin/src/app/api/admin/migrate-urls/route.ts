import { NextResponse } from "next/server";
import { prisma } from "@vx/db";

/**
 * Strips the CDN host prefix from all R2 URLs in the database,
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
    const books = await prisma.book.findMany();
    for (const book of books) {
      const data = book as unknown as Record<string, unknown>;
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
      const coloringPagesArr = (book.coloringPages as Array<Record<string, unknown>>) || [];
      const cpResult = stripArrayUrls(coloringPagesArr, "url");
      if (cpResult) {
        updates.coloringPages = cpResult.updated;
        changed = true;
      }

      // coloringPages[].coloredUrl
      if (coloringPagesArr.length) {
        const coloredResult = stripArrayUrls(coloringPagesArr, "coloredUrl");
        if (coloredResult) {
          // Merge with existing coloringPages update
          const base = (updates.coloringPages || coloringPagesArr) as Array<
            Record<string, unknown>
          >;
          updates.coloringPages = base.map((p, i) => ({
            ...p,
            ...(coloredResult.updated[i].coloredUrl !== coloringPagesArr[i].coloredUrl
              ? { coloredUrl: coloredResult.updated[i].coloredUrl }
              : {}),
          }));
          changed = true;
        }
      }

      // summaryPages[].url
      const summaryPagesArr = (book.summaryPages as Array<Record<string, unknown>>) || [];
      const spResult = stripArrayUrls(summaryPagesArr, "url");
      if (spResult) {
        updates.summaryPages = spResult.updated;
        changed = true;
      }

      if (changed) {
        await prisma.book.update({ where: { id: book.id }, data: updates });
        stats.books++;
      }
    }

    // --- Art Styles ---
    const artStyles = await prisma.artStyle.findMany();
    for (const style of artStyles) {
      const data = style as unknown as Record<string, unknown>;
      const updates: Record<string, unknown> = {};
      let changed = false;

      const fieldUpdates = stripUrlFields(data, ["thumbnailUrl"]);
      if (fieldUpdates) {
        Object.assign(updates, fieldUpdates);
        changed = true;
      }

      const refArr = (style.referenceImages as Array<Record<string, unknown>>) || [];
      const refResult = stripArrayUrls(refArr, "url");
      if (refResult) {
        updates.referenceImages = refResult.updated;
        changed = true;
      }

      if (changed) {
        await prisma.artStyle.update({ where: { id: style.id }, data: updates });
        stats.artStyles++;
      }
    }

    // --- Coloring Styles ---
    const coloringStyles = await prisma.coloringStyle.findMany();
    for (const style of coloringStyles) {
      const data = style as unknown as Record<string, unknown>;
      const updates: Record<string, unknown> = {};
      let changed = false;

      const fieldUpdates = stripUrlFields(data, ["thumbnailUrl"]);
      if (fieldUpdates) {
        Object.assign(updates, fieldUpdates);
        changed = true;
      }

      const refArr = (style.referenceImages as Array<Record<string, unknown>>) || [];
      const refResult = stripArrayUrls(refArr, "url");
      if (refResult) {
        updates.referenceImages = refResult.updated;
        changed = true;
      }

      if (changed) {
        await prisma.coloringStyle.update({ where: { id: style.id }, data: updates });
        stats.coloringStyles++;
      }
    }

    // --- Characters ---
    const characters = await prisma.character.findMany();
    for (const character of characters) {
      const data = character as unknown as Record<string, unknown>;
      const fieldUpdates = stripUrlFields(data, ["referenceImageUrl", "thumbnailUrl"]);
      if (fieldUpdates) {
        await prisma.character.update({ where: { id: character.id }, data: fieldUpdates });
        stats.characters++;
      }
    }

    // --- Locations ---
    const locations = await prisma.location.findMany();
    for (const location of locations) {
      const data = location as unknown as Record<string, unknown>;
      const fieldUpdates = stripUrlFields(data, ["referenceImageUrl", "thumbnailUrl"]);
      if (fieldUpdates) {
        await prisma.location.update({ where: { id: location.id }, data: fieldUpdates });
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
