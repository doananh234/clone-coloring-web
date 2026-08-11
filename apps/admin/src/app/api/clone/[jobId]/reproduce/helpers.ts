import { prisma } from "@vx/db";
import { editImage } from "@vx/server-core/ai";
import { buildRedesignPrompt, type CameraView } from "@vx/server-core/ai/prompts";
import { createR2Client, getR2Config, uploadToR2, resolveR2Url } from "@vx/server-core/r2";
import type { CloneJobPage } from "@vx/server-core/ai/clone-types";
import { mirrorUrlToSelectedVariant } from "@vx/coloring/data/page-variants";

export type R2Client = ReturnType<typeof createR2Client>;
export type R2Config = ReturnType<typeof getR2Config>;

/**
 * Per-key promise-chain lock. The read-modify-write blocks below rewrite a
 * whole JSON array, so two overlapping writers (regen + angle on the same
 * page, apply racing a generate) would silently drop each other's fields.
 * Serializing only the short DB patch — not the ~30s image generation —
 * keeps parallel generation while making writes safe on a single instance.
 * (Multi-instance deployments would need a DB-level lock instead.)
 */
const writeLocks = new Map<string, Promise<unknown>>();

async function withWriteLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeLocks.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  writeLocks.set(key, tail);
  // Drop the entry once the chain drains so the map doesn't grow forever.
  tail.then(() => {
    if (writeLocks.get(key) === tail) writeLocks.delete(key);
  });
  return run;
}

/**
 * Image-to-image variation of a page using the shared redesign template
 * (~30% change; optional forced camera view). Uploads to the given R2 key and
 * returns the URL with a ?v= cache-buster (keys are stable per page, so
 * browsers/CDN would otherwise keep serving the previous render).
 */
export async function generateVariation(opts: {
  sourceImageUrl: string;
  key: string;
  traceEntityId: string;
  cameraView?: CameraView;
  /** How much the variation differs from the source (default 30%). */
  changePercent?: number;
  r2Client: R2Client;
  r2Config: R2Config;
}): Promise<string> {
  const { sourceImageUrl, key, traceEntityId, cameraView, changePercent = 30, r2Client, r2Config } = opts;
  const fullPrompt = buildRedesignPrompt(changePercent, cameraView ? { cameraView } : {});
  const img = await editImage(resolveR2Url(sourceImageUrl), fullPrompt, {
    trace: { caller: "clone/reproduce", entityType: "cloneJob", entityId: traceEntityId },
  });

  const base64 = img.base64 || img.dataUrl?.split(",")[1] || "";
  const buffer = Buffer.from(base64, "base64");
  const { url } = await uploadToR2({
    client: r2Client,
    config: r2Config,
    key,
    body: buffer,
    contentType: "image/png",
  });

  return `${url}?v=${Date.now()}`;
}

/**
 * Patches a single cloneJob page with a fresh read-modify-write. Concurrent
 * regens of other pages each write the full array, so patching a
 * request-start snapshot would drop their updates (image generation takes
 * ~30s — plenty of overlap). Returns the patched page, or null if the job or
 * page no longer exists.
 */
export async function patchJobPage(
  jobId: string,
  pageIndex: number,
  patch: (page: CloneJobPage) => CloneJobPage,
): Promise<CloneJobPage | null> {
  return withWriteLock(`cloneJob:${jobId}`, async () => {
    const freshRow = await prisma.cloneJob.findUnique({
      where: { id: jobId },
      select: { pages: true },
    });
    const freshPages = ((freshRow?.pages as CloneJobPage[]) || []).slice();
    const target = freshPages[pageIndex];
    if (!target) return null;

    const patched = patch(target);
    freshPages[pageIndex] = patched;
    await prisma.cloneJob.update({
      where: { id: jobId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { pages: freshPages as any },
    });
    return patched;
  });
}

/**
 * Points the book's coloring page at a new URL (apply step). No-op when the
 * book or the page at that index doesn't exist.
 */
export async function updateBookPageUrl(
  bookId: string,
  pageIndex: number,
  url: string,
): Promise<boolean> {
  return withWriteLock(`book:${bookId}`, async () => {
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const coloringPages = ((book.coloringPages as any[]) || []).slice();
    if (!coloringPages[pageIndex]) return false;

    coloringPages[pageIndex] = mirrorUrlToSelectedVariant({ ...coloringPages[pageIndex], url, status: "done" }, url);
    await prisma.book.update({
      where: { id: bookId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { coloringPages: coloringPages as any },
    });
    return true;
  });
}
