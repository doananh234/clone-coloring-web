import { copyR2Object, createR2Client, getR2Config } from "@vx/server-core/r2";

const r2Config = getR2Config();
const r2Client = createR2Client(r2Config);

/**
 * Moves a clone-job page image into the book's permanent assets/{bookId}/
 * prefix via a server-side R2 copy (no download/re-upload). clone-job
 * assets (assets/clone-jobs/{jobId}/...) are purged over time (see
 * apps/worker/src/scripts/cleanup-failed.ts) — a published book must not
 * keep depending on that temporary storage. Leaves external or empty URLs
 * untouched — only internal "/assets/..." paths are ours to move.
 */
export async function moveCloneJobImageToBook(args: {
  sourceUrl: string;
  bookId: string;
  pageIndex: number;
}): Promise<string> {
  const { sourceUrl, bookId, pageIndex } = args;
  if (!sourceUrl || sourceUrl.startsWith("http://") || sourceUrl.startsWith("https://")) {
    return sourceUrl;
  }

  const ext = sourceUrl.split(".").pop()?.split("?")[0] || "png";
  const destKey = `assets/${bookId}/pages/page-${String(pageIndex + 1).padStart(3, "0")}.${ext}`;
  const sourceKey = sourceUrl.replace(/^\//, "").split("?")[0];

  const { url } = await copyR2Object({ client: r2Client, config: r2Config, sourceKey, destKey });
  return url;
}
