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
  analyzeData: unknown;
}

export interface OneShotDeps {
  /** Calls Diaflow with the source PDF, returns one record per page. */
  runOneShot: (pdfUrl: string, jobId: string) => Promise<OneShotPageResult[]>;
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
  const allDone =
    existing.length > 0 &&
    existing.every((p) => p.redesignedUrl && p.status === "reproduced");
  if (allDone) {
    await markStepsComplete(ctx);
    return;
  }

  const pdfPublicUrl = deps.resolveR2Url(job.sourcePdfUrl);
  const pages = await deps.runOneShot(pdfPublicUrl, ctx.jobId);

  const jobPages: JobPage[] = [];
  for (let i = 0; i < pages.length; i++) {
    const item = pages[i];
    const pageNumber = i + 1;

    const { body, contentType } = await deps.fetchImage(item.redesignedImageUrl);
    const key = `assets/clone-jobs/${ctx.jobId}/redesigned/page-${String(pageNumber).padStart(3, "0")}.png`;
    const { url } = await deps.uploadToR2({
      key,
      body,
      contentType: contentType || "image/png",
    });

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
      imageUrl: url,
      redesignedUrl: url,
      status: "reproduced",
      rawData,
    });
  }

  await db.cloneJob.update({
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
