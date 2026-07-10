import type { PrismaClient } from "@vx/db";
import type { JobContext } from "../job-context";

/**
 * Single-call clone step — replaces render + analyze + extract-entities +
 * reproduce when the user opts into the Diaflow one-shot pipeline.
 *
 * Input from job: `sourcePdfUrl` (R2 relative path written by stepDownload).
 * Output: populates `job.pages` with one entry per PDF page, each carrying
 * the redesigned R2 url AND the parsed analyze JSON (same shape stepAnalyze
 * would produce). Downstream `stepCreateBook` consumes this unchanged.
 *
 * Steps marked complete after this runs: render, analyze, extract-entities,
 * reproduce — so the processor can skip straight to create-book.
 */

export interface OneShotPageResult {
  redesignedImageUrl: string;
  /**
   * Source page image URL (from Diaflow's `loop_N_output.url`). Optional
   * because older flow shapes may not emit it — falls back to redesigned
   * URL when missing so `JobPage.imageUrl` is always populated.
   */
  originalImageUrl?: string;
  analyzeData: unknown;
}

export interface OneShotDeps {
  /**
   * Calls Diaflow with the source PDF and returns the Diaflow sessionId (for
   * later recheck) plus one record per page.
   */
  runOneShot: (
    pdfUrl: string,
    jobId: string,
    brandInfo?: string,
  ) => Promise<{ sessionId: string; pages: OneShotPageResult[] }>;
  /** Downloads the redesigned image bytes from the Diaflow CDN URL. */
  fetchImage: (url: string) => Promise<{ body: Buffer; contentType: string }>;
  /** Uploads bytes to R2, returns the public URL. */
  uploadToR2: (args: { key: string; body: Buffer; contentType: string }) => Promise<{ url: string }>;
  /** Resolves a stored relative path to a full URL. */
  resolveR2Url: (key: string) => string;
}

interface JobPage {
  pageNumber: number;
  imageUrl: string;
  status: string;
  rawData?: unknown;
  redesignedUrl?: string;
  redesignPrompt?: string;
  error?: string;
}

export async function stepOneShot(
  ctx: JobContext,
  db: PrismaClient,
  deps: OneShotDeps,
): Promise<void> {
  const job = await db.cloneJob.findUnique({ where: { id: ctx.jobId } });
  if (!job) throw new Error(`cloneJob ${ctx.jobId} missing`);
  if (!job.sourcePdfUrl) {
    throw new Error(`cloneJob ${ctx.jobId} has no sourcePdfUrl (run stepDownload first)`);
  }

  const existing = (job.pages as JobPage[] | null | undefined) ?? [];

  // Peek at SourceBook cache — a previous stepOneShot run mirrors the raw
  // Diaflow output there BEFORE image processing, so if it exists we can
  // skip re-calling Diaflow (~30-40min per PDF). Also used to detect the
  // "stuck with a partial save from a previous parser bug" case: existing
  // pages may look 'reproduced' but there are actually more pages waiting.
  let cachedSessionId = "";
  let cachedPages: OneShotPageResult[] | null = null;
  if (ctx.sourceBookId) {
    const sb = await db.sourceBook.findUnique({ where: { id: ctx.sourceBookId } });
    const sbData = (sb?.data as Record<string, unknown> | null | undefined) ?? {};
    if (typeof sbData.oneShotSessionId === "string") {
      cachedSessionId = sbData.oneShotSessionId;
    }
    if (Array.isArray(sbData.oneShotPages)) {
      cachedPages = sbData.oneShotPages as OneShotPageResult[];
    }
  }

  const expectedCount = cachedPages?.length ?? 0;
  const allDone =
    existing.length > 0 &&
    (expectedCount === 0 || existing.length >= expectedCount) &&
    existing.every((p) => p.redesignedUrl && p.status === "reproduced");
  if (allDone) {
    await markStepsComplete(ctx);
    return;
  }

  // Reuse cached Diaflow output when available — the images + analyze JSON
  // are already there, we just need to re-upload to R2 and rebuild jobPages.
  let sessionId: string;
  let pages: OneShotPageResult[];
  if (cachedSessionId && cachedPages && cachedPages.length > 0) {
    sessionId = cachedSessionId;
    pages = cachedPages;
  } else {
    const pdfPublicUrl = deps.resolveR2Url(job.sourcePdfUrl);
    const brandInfo = await resolveBrandInfo(job, db);
    ({ sessionId, pages } = await deps.runOneShot(pdfPublicUrl, ctx.jobId, brandInfo));
  }

  // Persist to SourceBook FIRST — it outlives CloneJob (CloneJob can be
  // deleted mid-run via the admin UI or cleanup script; SourceBook cannot).
  // Storing sessionId + raw pages here means the recheck route can recover
  // data even if the CloneJob row is gone by the time we get here.
  if (ctx.sourceBookId) {
    try {
      const sb = await db.sourceBook.findUnique({ where: { id: ctx.sourceBookId } });
      const prevSbData = (sb?.data as Record<string, unknown> | null | undefined) ?? {};
      await db.sourceBook.update({
        where: { id: ctx.sourceBookId },
        data: {
          data: {
            ...prevSbData,
            oneShotSessionId: sessionId,
            oneShotPages: pages,
            oneShotCompletedAt: new Date().toISOString(),
          } as never,
        },
      });
    } catch (err) {
      // Non-fatal: if SourceBook is gone too, log and continue — the
      // sessionId is still returned by runOneShot and captured in worker logs.
      console.error("[stepOneShot] failed to persist to SourceBook:", err);
    }
  }

  // Now try CloneJob — silently no-op if the row was deleted mid-flight.
  const prevData = (job.data as Record<string, unknown> | null | undefined) ?? {};
  await db.cloneJob.updateMany({
    where: { id: ctx.jobId },
    data: { data: { ...prevData, oneShotSessionId: sessionId } as never },
  });

  const jobPages: JobPage[] = [];
  for (let i = 0; i < pages.length; i++) {
    const item = pages[i];
    const pageNumber = i + 1;
    const paddedPage = String(pageNumber).padStart(3, "0");

    // Redesigned image — mirror to R2 (Diaflow CDN URLs are signed + expire).
    const redesignedFetch = await deps.fetchImage(item.redesignedImageUrl);
    const redesignedKey = `assets/clone-jobs/${ctx.jobId}/redesigned/page-${paddedPage}.png`;
    const { url: redesignedR2Url } = await deps.uploadToR2({
      key: redesignedKey,
      body: redesignedFetch.body,
      contentType: redesignedFetch.contentType || "image/png",
    });

    // Original page image — use the R2 URL that stepRender already produced
    // for this pageNumber. stepRender is now a prerequisite of the one-shot
    // pipeline, so `existing[i]` should always be populated. Fall back to ""
    // and warn if not (Diaflow returned MORE pages than the PDF rendered —
    // shouldn't happen in practice but visible if it does).
    const renderedOriginal = existing[i]?.imageUrl ?? "";
    if (!renderedOriginal) {
      console.warn(
        `[stepOneShot] page ${pageNumber}: no rendered original found in job.pages. ` +
          `stepRender may have failed or Diaflow returned more pages than the PDF rendered.`,
      );
    }

    const analyze = (item.analyzeData ?? {}) as Record<string, unknown>;
    const rawData = {
      // Preserve every field the LLM emitted (titleCover, subtitle, isCover,
      // isBW, visualDna, ...). Guaranteed fallbacks below keep every existing
      // consumer (stepCreateBook, admin UI) working unchanged.
      ...analyze,
      scene: analyze.scene ?? { description: "", cameraView: "wide", composition: "" },
      environment: analyze.environment ?? {
        timeOfDay: "day",
        weather: "sunny",
        season: "neutral",
        mood: "peaceful",
      },
      characters: analyze.characters ?? [],
      locations: analyze.locations ?? [],
      props: analyze.props ?? [],
      reproductionPrompt:
        typeof analyze.reproductionPrompt === "string" ? analyze.reproductionPrompt : "",
    };

    jobPages.push({
      pageNumber,
      imageUrl: renderedOriginal,
      redesignedUrl: redesignedR2Url,
      status: "reproduced",
      rawData,
    });
  }

  // Extract book-level cover meta from the page tagged isCover: true.
  // Only present in Diaflow output when the LLM identifies a cover-style page.
  // User-set titleCover/subtitle in bookData are preserved (never overwritten).
  const coverPageAnalyze = pages
    .map((p) => p.analyzeData as Record<string, unknown> | null | undefined)
    .find((d) => d?.isCover === true);

  if (coverPageAnalyze) {
    const currentBookData = (job.bookData as Record<string, unknown> | null | undefined) ?? {};
    const diaflowTitleCover =
      typeof coverPageAnalyze.titleCover === "string" ? coverPageAnalyze.titleCover : undefined;
    const diaflowSubtitle =
      typeof coverPageAnalyze.subtitle === "string" ? coverPageAnalyze.subtitle : undefined;

    // Only populate from Diaflow if user hasn't already set these fields
    const nextTitleCover =
      typeof currentBookData.titleCover === "string"
        ? currentBookData.titleCover
        : diaflowTitleCover;
    const nextSubtitle =
      typeof currentBookData.subtitle === "string" ? currentBookData.subtitle : diaflowSubtitle;

    // Always write bookData when a cover page is found (to record the decision)
    const nextBookData = {
      ...currentBookData,
      ...(nextTitleCover !== undefined ? { titleCover: nextTitleCover } : {}),
      ...(nextSubtitle !== undefined ? { subtitle: nextSubtitle } : {}),
    };

    // Only update if something actually changed
    if (
      nextTitleCover !== currentBookData.titleCover ||
      nextSubtitle !== currentBookData.subtitle
    ) {
      await db.cloneJob.updateMany({
        where: { id: ctx.jobId },
        data: {
          bookData: nextBookData as never,
        },
      });
    }
  }

  await db.cloneJob.updateMany({
    where: { id: ctx.jobId },
    data: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pages: jobPages as any,
      analyzedPages: jobPages.length,
      totalPages: jobPages.length,
    },
  });

  await markStepsComplete(ctx);
}

async function markStepsComplete(ctx: JobContext): Promise<void> {
  if (!ctx.isDone("render")) await ctx.markStepComplete("render");
  if (!ctx.isDone("analyze")) await ctx.markStepComplete("analyze");
  if (!ctx.isDone("extract-entities")) await ctx.markStepComplete("extract-entities");
  if (!ctx.isDone("reproduce")) await ctx.markStepComplete("reproduce");
}

export interface ResolvedBrand {
  id: string;
  name: string;
  data: Record<string, unknown>;
}

/**
 * Resolves the CloneJob's brand row fresh from the DB.
 *
 * Lookup priority:
 *   1. job.data.brandId (findUnique)   ← primary; immune to Brand renames
 *   2. job.data.brand   (findFirst by name)
 *   3. first brand ordered by (index asc, createdAt asc)
 *
 * Returns null only when no brand exists at all in the DB.
 */
export async function resolveBrand(
  job: { data?: unknown } & Record<string, unknown>,
  db: PrismaClient,
): Promise<ResolvedBrand | null> {
  const jobData = (job.data as Record<string, unknown> | null | undefined) ?? {};

  const brandId = typeof jobData.brandId === "string" ? jobData.brandId.trim() : "";
  if (brandId) {
    const row = await db.brand.findUnique({ where: { id: brandId } });
    if (row) {
      return {
        id: row.id,
        name: row.name,
        data: (row.data as Record<string, unknown> | null | undefined) ?? {},
      };
    }
  }

  const brandName = typeof jobData.brand === "string" ? jobData.brand.trim() : "";
  if (brandName) {
    const row = await db.brand.findFirst({ where: { name: brandName } });
    if (row) {
      return {
        id: row.id,
        name: row.name,
        data: (row.data as Record<string, unknown> | null | undefined) ?? {},
      };
    }
  }

  const fallback = await db.brand.findFirst({
    orderBy: [{ index: "asc" }, { createdAt: "asc" }],
  });
  if (fallback) {
    return {
      id: fallback.id,
      name: fallback.name,
      data: (fallback.data as Record<string, unknown> | null | undefined) ?? {},
    };
  }
  return null;
}

/**
 * Legacy thin wrapper for Diaflow's `brand_info` payload (needs just the name).
 * New callers should use resolveBrand() directly to get the full row.
 */
export async function resolveBrandInfo(
  job: { data?: unknown } & Record<string, unknown>,
  db: PrismaClient,
): Promise<string | undefined> {
  const resolved = await resolveBrand(job, db);
  if (!resolved) return undefined;
  const jobData = (job.data as Record<string, unknown> | null | undefined) ?? {};
  const explicit = typeof jobData.brand === "string" ? jobData.brand.trim() : "";
  const explicitBrandId = typeof jobData.brandId === "string" ? jobData.brandId.trim() : "";
  // Warn once if we had to fall back to the first brand (no explicit match)
  if (!explicit && !explicitBrandId) {
    console.warn(
      `[stepOneShot] cloneJob ${job.id} has no selected brand; using first brand "${resolved.name}" for Diaflow brand_info.`,
    );
  }
  return resolved.name;
}
