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
  stepFillInterior,
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
  fillInteriorDeps,
} from "./step-deps";

// silence unused-import warnings for the manually-triggered extract step.
void stepExtractEntities;
void extractEntitiesDeps;

export async function processCloneJob(jobId: string): Promise<void> {
  // A job can be stashed between enqueue and pickup (stash removes the BullMQ
  // record, but a race can leave one behind) — never run a stashed job.
  const job = await db.cloneJob.findUnique({ where: { id: jobId } });
  if (job?.status === "stashed") {
    console.log(`[worker] skipping stashed clone job ${jobId}`);
    return;
  }

  const ctx = await JobContext.load(db, jobId);
  await db.cloneJob.update({
    where: { id: jobId },
    data: { status: "running" },
  });

  // Pipeline selection — DEFAULT is one-shot (single Diaflow call).
  // Opt out only when explicitly requested:
  //   job.data.useMultiStep === true       → run legacy multi-step pipeline
  //   CLONE_USE_MULTI_STEP === "true"      → multi-step for all jobs (fallback switch)
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

    // D2 gate — pause for the operator's classification review before building
    // the Book. The default one-shot pipeline has already reproduced the pages
    // by this point (spec §4.4), so the gate lands here: after reproduce,
    // before create-book. Resumed by PATCH /api/clone/[jobId]/classify with
    // { confirm: true }, which sets classifyConfirmed and re-enqueues the job —
    // on the second run download/render/reproduce are all `isDone`, so the
    // worker skips straight back to this check (now passing) and continues.
    //
    // Auto-classify: set CLONE_AUTO_CLASSIFY=true (env) or job.data.autoClassify
    // to skip the manual review entirely — the job flows straight through to
    // fill-interior → create-book without any manual step.
    const gateRow = await db.cloneJob.findUnique({
      where: { id: jobId },
      select: { data: true },
    });
    const gateData =
      (gateRow?.data as { classifyConfirmed?: boolean; autoClassify?: boolean } | null | undefined) ?? {};
    const autoClassify = process.env.CLONE_AUTO_CLASSIFY === "true" || gateData.autoClassify === true;
    if (!gateData.classifyConfirmed && !autoClassify) {
      await db.cloneJob.updateMany({
        where: { id: jobId },
        data: { status: "awaiting-classify" },
      });
      console.log(`[worker] clone job ${jobId} paused at classify gate`);
      return;
    }
    if (!gateData.classifyConfirmed && autoClassify) {
      // Persist the auto-pass so a later resume/reconcile also treats it confirmed.
      await db.cloneJob.updateMany({
        where: { id: jobId },
        data: { data: { ...(gateRow?.data as Record<string, unknown> | null ?? {}), classifyConfirmed: true } as never },
      });
      console.log(`[worker] clone job ${jobId} auto-passed classify gate (CLONE_AUTO_CLASSIFY)`);
    }

    // D3 — reach the configured interior target by cloning source interiors.
    // Runs only after the gate passed (operator confirmed classification).
    if (!ctx.isDone("fill-interior"))
      await withRetry("fill-interior", () => stepFillInterior(ctx, db, fillInteriorDeps), ctx);

    const bookId = ctx.isDone("create-book") && ctx.resultBookId
      ? ctx.resultBookId
      : await withRetry("create-book", () => stepCreateBook(ctx, db, createBookDeps), ctx);

    // No automatic cover any more: the book keeps the SOURCE book's cover, set
    // by create-book. generate-cover / generate-book-meta / finalize-cover stay
    // in clone-core (and in STEP_ORDER, which JobContext.isDone() indexes — old
    // jobs may still have one of them as currentStep) but are no longer run.
    // Meta and a designed cover are on-demand from the book screen.
    await ctx.markComplete(bookId);
    await notifySuccess(ctx, bookId);
  } catch (err) {
    await ctx.markFailed(err);
    await notifyFailure(ctx, err);
    throw err;
  }
}
