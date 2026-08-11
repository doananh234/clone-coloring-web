import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import JSZip from "jszip";
import { resolveR2Url } from "@vx/server-core/r2";

/**
 * Export a book's images as a ZIP of individual PNG/JPG files (NOT a merged PDF —
 * kept separate so each page can be processed on its own). Each book gets 3 folders
 * (Book cover / Book intro / Book interior):
 *
 *   Main book/  (ORIGINAL source images = imageUrl, split by pageType)
 *     Book cover/     ← source pages pageType="cover" (fallback: first source page)
 *     Book intro/     ← source pages pageType="interiorIntro"
 *     Book interior/  ← source pages pageType="interior"/unclassified  (excluded pages skipped)
 *   Clone book/  (this Book — B&W line-art, NOT the colored result)
 *     Book cover/     ← ALL cover candidates (data.coverCandidates[]; fallback coverUrl)
 *     Book intro/     ← summaryPages[].url (B&W)
 *     Book interior/  ← coloringPages[].url (B&W — colorized / pushed-to-cover pages stay here)
 *
 * "Main book" = the ORIGINAL source it was cloned from (the source CloneJob);
 * "Clone book" = this Book record (the AI-generated clone/reproduction).
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

  type Page = { url?: string; coloredUrl?: string; imageUrl?: string; pageType?: string; excluded?: boolean };
  const data = (book.data as Record<string, unknown> | null) ?? {};
  const pad = (i: number) => `page-${String(i + 1).padStart(3, "0")}`;
  const toEntries = (arr: Page[], key: "imageUrl" | "url"): ImageEntry[] =>
    arr.map((p, i) => ({ url: p[key] || "", name: pad(i) })).filter((e) => e.url);

  const zip = new JSZip();

  // --- Main book = the ORIGINAL source (source CloneJob), original imageUrl,
  //     split into cover / intro / interior by pageType (excluded pages skipped). ---
  const cloneJobId = typeof data.cloneJobId === "string" ? data.cloneJobId : undefined;
  const job = cloneJobId ? await prisma.cloneJob.findUnique({ where: { id: cloneJobId } }) : null;
  if (job) {
    const jobPages = (job.pages as Page[] | null) ?? [];
    const included = jobPages.filter((p) => !p.excluded);
    // cover = pageType "cover"; fallback to the first source page if none classified.
    let coverPages = included.filter((p) => p.pageType === "cover");
    if (coverPages.length === 0 && jobPages[0]) coverPages = [jobPages[0]];
    const introPages = included.filter((p) => p.pageType === "interiorIntro");
    const coverSet = new Set(coverPages);
    const introSet = new Set(introPages);
    // interior = everything else (pageType "interior" or unclassified), no overlap.
    const interiorPages = included.filter((p) => !coverSet.has(p) && !introSet.has(p));
    await addFolder(zip, "Main book/Book cover", toEntries(coverPages, "imageUrl"));
    await addFolder(zip, "Main book/Book intro", toEntries(introPages, "imageUrl"));
    await addFolder(zip, "Main book/Book interior", toEntries(interiorPages, "imageUrl"));
  }

  // --- Clone book = this Book, exported as B&W line-art (never the colored result;
  //     colorized / pushed-to-cover pages still appear in interior as B&W). ---
  const coverCandidates = (data.coverCandidates as { url?: string }[] | null) ?? [];
  const cloneCover: ImageEntry[] =
    coverCandidates.length > 0
      ? coverCandidates
          .map((c, i) => ({ url: c.url || "", name: `cover-${String(i + 1).padStart(2, "0")}` }))
          .filter((e) => e.url)
      : book.coverUrl
        ? [{ url: book.coverUrl, name: "cover" }]
        : [];
  const summaryPages = (book.summaryPages as Page[] | null) ?? [];
  const coloringPages = (book.coloringPages as Page[] | null) ?? [];
  await addFolder(zip, "Clone book/Book cover", cloneCover);
  await addFolder(zip, "Clone book/Book intro", toEntries(summaryPages, "url"));
  await addFolder(zip, "Clone book/Book interior", toEntries(coloringPages, "url"));

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
