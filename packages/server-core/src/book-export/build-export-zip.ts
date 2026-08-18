import { createHash } from "node:crypto";
import JSZip from "jszip";
import { resolveR2Url } from "../r2";

export type ExportPageLike = {
  url?: string;
  coloredUrl?: string;
  imageUrl?: string;
  pageType?: string;
  excluded?: boolean;
};

export interface ExportInput {
  bookTitle: string;
  bookData: Record<string, unknown> | null;
  coverUrl?: string | null;
  summaryPages: ExportPageLike[];
  coloringPages: ExportPageLike[];
  cloneJobPages: ExportPageLike[] | null;
  cloneJobId?: string;
}

export interface ExportEntry { url: string; name: string }
export interface ExportFolder { path: string; entries: ExportEntry[] }
export interface ExportPlan { folders: ExportFolder[]; hash: string; filename: string }

function slug(s: string): string {
  return (
    (s || "book").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) ||
    "book"
  );
}

const pad = (i: number) => `page-${String(i + 1).padStart(3, "0")}`;
const pad2 = (i: number) => String(i + 1).padStart(2, "0");

function toEntries(arr: ExportPageLike[], key: "imageUrl" | "url" | "coloredUrl"): ExportEntry[] {
  return arr.map((p, i) => ({ url: p[key] || "", name: pad(i) })).filter((e) => e.url);
}

/**
 * Build the folder/entry plan for a book export and a content hash over every
 * input image URL (+ cloneJobId). No network I/O — pure data. Folder layout is
 * identical to the legacy synchronous export route.
 */
export function collectExportPlan(input: ExportInput): ExportPlan {
  const data = input.bookData ?? {};
  const folders: ExportFolder[] = [];
  const push = (path: string, entries: ExportEntry[]) => folders.push({ path, entries });

  // --- Main book = the ORIGINAL source (source CloneJob), split by pageType. ---
  if (input.cloneJobPages) {
    const jobPages = input.cloneJobPages;
    const included = jobPages.filter((p) => !p.excluded);
    let coverPages = included.filter((p) => p.pageType === "cover");
    if (coverPages.length === 0 && included[0]) coverPages = [included[0]];
    const introPages = included.filter((p) => p.pageType === "interiorIntro");
    const coverSet = new Set(coverPages);
    const introSet = new Set(introPages);
    const interiorPages = included.filter((p) => !coverSet.has(p) && !introSet.has(p));
    push("Main book/Book cover", toEntries(coverPages, "imageUrl"));
    push("Main book/Book intro", toEntries(introPages, "imageUrl"));
    push("Main book/Book interior", toEntries(interiorPages, "imageUrl"));
  }

  // --- Clone book = this Book (B&W line-art + colored + source covers). ---
  const coverCandidates = (data.coverCandidates as { url?: string }[] | null) ?? [];
  const cloneCover: ExportEntry[] =
    coverCandidates.length > 0
      ? coverCandidates
          .map((c, i) => ({ url: c.url || "", name: `cover-${pad2(i)}` }))
          .filter((e) => e.url)
      : input.coverUrl
        ? [{ url: input.coverUrl, name: "cover" }]
        : [];
  const sourceCovers = (data.sourceCovers as ExportPageLike[] | null) ?? [];
  push("Clone book/Book cover", cloneCover);
  push("Clone book/Book intro", toEntries(input.summaryPages, "url"));
  push("Clone book/Book interior", toEntries(input.coloringPages, "url"));
  push("Clone book/Book colored", toEntries(input.coloringPages, "coloredUrl"));
  push("Clone book/Source cover", toEntries(sourceCovers, "url"));
  push("Clone book/Source cover colored", toEntries(sourceCovers, "coloredUrl"));

  const allUrls = folders.flatMap((f) => f.entries.map((e) => e.url));
  const hash = createHash("sha256")
    .update(JSON.stringify(allUrls) + "|" + (input.cloneJobId ?? ""))
    .digest("hex")
    .slice(0, 16);

  return { folders, hash, filename: `${slug(input.bookTitle)}-${hash}.zip` };
}

/** Fetch an R2 image and return its bytes + detected extension (png/jpg). */
async function fetchImage(url: string): Promise<{ bytes: Uint8Array; ext: string } | null> {
  const full = resolveR2Url(url) || url;
  if (!full) return null;
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

/** Fetch every entry and pack the zip. Missing/unfetchable images are skipped. */
export async function buildExportZip(plan: ExportPlan): Promise<Buffer> {
  const zip = new JSZip();
  for (const folder of plan.folders) {
    await Promise.all(
      folder.entries.map(async (e) => {
        const img = await fetchImage(e.url);
        if (!img) return;
        zip.file(`${folder.path}/${e.name}.${img.ext}`, img.bytes);
      }),
    );
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
