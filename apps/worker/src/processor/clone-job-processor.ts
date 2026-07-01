import {
  JobContext,
  withRetry,
  stepDownload,
  stepRender,
  stepAnalyze,
  stepExtractEntities,
  stepReproduce,
  stepCreateBook,
  stepOneShot,
} from "@vx/clone-core";
import { db } from "../db";
import { notifySuccess, notifyFailure } from "../notify/telegram";
import {
  downloadDeps,
  renderDeps,
  analyzeDeps,
  extractEntitiesDeps,
  reproduceDeps,
  createBookDeps,
  oneShotDeps,
} from "./step-deps";

// silence unused-import warnings for the manually-triggered extract step.
void stepExtractEntities;
void extractEntitiesDeps;

export async function processCloneJob(jobId: string): Promise<void> {
  const ctx = await JobContext.load(db, jobId);
  await db.cloneJob.update({
    where: { id: jobId },
    data: { status: "running" },
  });

  // Pipeline selection — DEFAULT is one-shot (single Diaflow call).
  // Opt out only when explicitly requested:
  //   job.data.useMultiStep === true       → run legacy multi-step pipeline
  //   CLONE_USE_MULTI_STEP === "true"      → multi-step for all jobs (fallback switch)
  const job = await db.cloneJob.findUnique({ where: { id: jobId } });
  const data = (job?.data as { useMultiStep?: boolean } | null | undefined) ?? {};
  const useMultiStep =
    typeof data.useMultiStep === "boolean"
      ? data.useMultiStep
      : process.env.CLONE_USE_MULTI_STEP === "true";

  try {
    // Skip download when the PDF is already in R2 (manual upload flow — no
    // sourceBookId, sourcePdfUrl set at job creation). stepDownload only
    // applies when the job originated from a SourceBook that must be fetched.
    if (!ctx.isDone("download")) {
      if (ctx.sourceBookId) {
        await withRetry("download", () => stepDownload(ctx, db, downloadDeps), ctx);
      } else {
        await ctx.markStepComplete("download");
      }
    }

    if (useMultiStep) {
      if (!ctx.isDone("render"))           await withRetry("render",           () => stepRender(ctx, db, renderDeps),                     ctx);
      if (!ctx.isDone("analyze"))          await withRetry("analyze",          () => stepAnalyze(ctx, db, analyzeDeps),                   ctx);
      if (!ctx.isDone("extract-entities")) await ctx.markStepComplete("extract-entities");
      if (!ctx.isDone("reproduce"))        await withRetry("reproduce",        () => stepReproduce(ctx, db, reproduceDeps),               ctx);
    } else {
      // Default one-shot path:
      //   1. Render the source PDF into per-page PNGs ourselves and mirror to
      //      R2. This gives us permanent `imageUrl` values for each page's
      //      original — Diaflow's `loop_N_output` URLs are signed and expire,
      //      and the field is not always present.
      //   2. Diaflow one-shot handles the redesign + analyze JSON. stepOneShot
      //      merges its output into the pages that stepRender already seeded,
      //      preserving `imageUrl` and adding `redesignedUrl` + `rawData`.
      if (!ctx.isDone("render"))    await withRetry("render",    () => stepRender(ctx, db, renderDeps),    ctx);
      if (!ctx.isDone("reproduce")) await withRetry("reproduce", () => stepOneShot(ctx, db, oneShotDeps), ctx);
    }

    const bookId = ctx.isDone("create-book") && ctx.resultBookId
      ? ctx.resultBookId
      : await withRetry("create-book", () => stepCreateBook(ctx, db, createBookDeps), ctx);

    await ctx.markComplete(bookId);
    await notifySuccess(ctx, bookId);
  } catch (err) {
    await ctx.markFailed(err);
    await notifyFailure(ctx, err);
    throw err;
  }
}
