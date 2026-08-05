import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import JSZip from "jszip";
import { resolveR2Url } from "@vx/server-core/r2";

/**
 * Export a book's images as a ZIP of individual PNG/JPG files (NOT a merged PDF —
 * kept separate so each page can be processed on its own). Structure:
 *
 *   Main book/  Book cover/ cover.png
 *               Book interior/ page-001.png ...   (colored final, else B&W)
 *   Clone book/ Book cover/ cover.png             (source cover)
 *               Book interior/ page-001.png ...   (original source pages)
 *
 * "Main book" = this Book record; "Clone book" = the source CloneJob it came from.
 */

type ImageEntry = { url: string; name: string };

/** Fetch an R2 image and return its bytes + detected extension (png/jpg). */
async function fetchImage(url: string): Promise<{ bytes: Uint8Array; ext: string } | null> {
  const full = resolveR2Url(url);
  if (!full || !full.startsWith("http")) return null;
  try {
    const res = await fetch(full);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0) return null;
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    return { bytes, ext: isJpeg ? "jpg" : "png" };
  } catch {
    return null;
  }
}

/** Add a list of images into a zip folder as page-001.<ext>, page-002.<ext>… */
async function addFolder(zip: JSZip, folderPath: string, entries: ImageEntry[]): Promise<number> {
  let added = 0;
  await Promise.all(
    entries.map(async (e) => {
      const img = await fetchImage(e.url);
      if (!img) return;
      zip.file(`${folderPath}/${e.name}.${img.ext}`, img.bytes);
      added++;
    }),
  );
  return added;
}

function slug(s: string): string {
  return (s || "book").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "book";
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  type Page = { url?: string; coloredUrl?: string; imageUrl?: string };
  const data = (book.data as Record<string, unknown> | null) ?? {};
  const coverMeta = (data.coverMeta as Record<string, unknown> | undefined) ?? {};
  const pad = (i: number) => `page-${String(i + 1).padStart(3, "0")}`;

  const zip = new JSZip();

  // --- Main book (this Book record) ---
  const bookPages = (book.coloringPages as Page[] | null) ?? [];
  const mainCover: ImageEntry[] = book.coverUrl ? [{ url: book.coverUrl, name: "cover" }] : [];
  // Interior = final page: colored when available, else the B&W line-art.
  const mainInterior: ImageEntry[] = bookPages
    .map((p, i) => ({ url: p.coloredUrl || p.url || "", name: pad(i) }))
    .filter((e) => e.url);
  await addFolder(zip, "Main book/Book cover", mainCover);
  await addFolder(zip, "Main book/Book interior", mainInterior);

  // --- Clone book (source CloneJob) ---
  const cloneJobId = typeof data.cloneJobId === "string" ? data.cloneJobId : undefined;
  const job = cloneJobId ? await prisma.cloneJob.findUnique({ where: { id: cloneJobId } }) : null;
  if (job) {
    const jobPages = (job.pages as Page[] | null) ?? [];
    const srcCoverUrl =
      (typeof coverMeta.sourceThumbnailUrl === "string" && coverMeta.sourceThumbnailUrl) ||
      jobPages[0]?.imageUrl ||
      "";
    const cloneCover: ImageEntry[] = srcCoverUrl ? [{ url: srcCoverUrl, name: "cover" }] : [];
    const cloneInterior: ImageEntry[] = jobPages
      .map((p, i) => ({ url: p.imageUrl || "", name: pad(i) }))
      .filter((e) => e.url);
    await addFolder(zip, "Clone book/Book cover", cloneCover);
    await addFolder(zip, "Clone book/Book interior", cloneInterior);
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const filename = `${slug(book.title)}-export.zip`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
