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
    ({ sessionId, pages } = await deps.runOneShot(pdfPublicUrl, ctx.jobId));
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
