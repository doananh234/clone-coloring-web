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
  stepGenerateCover,
  stepFillInterior,
  stepTrimPdf,
  planPageSelection,
  type SelectablePage,
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
  generateCoverDeps,
  fillInteriorDeps,
  trimPdfDeps,
} from "./step-deps";

// silence unused-import warnings for the manually-triggered extract step.
void stepExtractEntities;
void extractEntitiesDeps;

export type GateOutcome =
  | { outcome: "await-classify" }
  | { outcome: "await-fill"; lane: 2; interiorCount: number }
  | { outcome: "proceed"; lane: 1; interiorCount: number };

/**
 * Pure gate decision. Kept separate from processCloneJob so the routing rule is
 * unit-testable without a database.
 */
export function decideGateOutcome(
  pages: SelectablePage[],
  classifyConfirmed: boolean,
): GateOutcome {
  if (!classifyConfirmed) return { outcome: "await-classify" };
  const { interiorCount, lane } = planPageSelection(pages);
  return lane === 1
    ? { outcome: "proceed", lane: 1, interiorCount }
    : { outcome: "await-fill", lane: 2, interiorCount };
}

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
      if (!ctx.isDone("render")) await withRetry("render", () => stepRender(ctx, db, renderDeps), ctx);

      // ---- Gate: everything above is free, everything below costs money. ----
      const gateRow = await db.cloneJob.findUnique({
        where: { id: jobId },
        select: { data: true, pages: true },
      });
      const gateData = (gateRow?.data as { classifyConfirmed?: boolean } | null | undefined) ?? {};
      const gatePages = (gateRow?.pages as SelectablePage[] | null | undefined) ?? [];
      const decision = decideGateOutcome(gatePages, gateData.classifyConfirmed === true);

      if (decision.outcome === "await-classify") {
        await db.cloneJob.updateMany({
          where: { id: jobId },
          data: { status: "awaiting-classify" },
        });
        console.log(`[worker] clone job ${jobId} paused at classify gate (pre-spend)`);
        return;
      }

      await db.cloneJob.updateMany({
        where: { id: jobId },
        data: {
          data: {
            ...gateData,
            interiorCount: decision.interiorCount,
            lane: decision.lane,
          } as never,
        },
      });

      if (decision.outcome === "await-fill") {
        await db.cloneJob.updateMany({
          where: { id: jobId },
          data: { status: "awaiting-fill" },
        });
        console.log(
          `[worker] clone job ${jobId} parked in lane 2 ` +
            `(interior=${decision.interiorCount} < 40) — no AI spend`,
        );
        return;
      }

      if (!ctx.isDone("trim-pdf"))
        await withRetry("trim-pdf", () => stepTrimPdf(ctx, db, trimPdfDeps), ctx);
      if (!ctx.isDone("reproduce"))
        await withRetry("reproduce", () => stepOneShot(ctx, db, oneShotDeps), ctx);
    }

    // D3 — reach the configured interior target by cloning source interiors.
    // Runs only after the gate passed (operator confirmed classification).
    if (!ctx.isDone("fill-interior"))
      await withRetry("fill-interior", () => stepFillInterior(ctx, db, fillInteriorDeps), ctx);

    const bookId = ctx.isDone("create-book") && ctx.resultBookId
      ? ctx.resultBookId
      : await withRetry("create-book", () => stepCreateBook(ctx, db, createBookDeps), ctx);

    if (!ctx.isDone("generate-cover")) {
      // stepGenerateCover runs in BOTH multi-step and one-shot paths. In one-shot mode,
      // stepOneShot populates bookData.titleCover from the Diaflow LLM's isCover page.
      // In multi-step mode, that extraction doesn't happen — stepGenerateCover falls back
      // to bookData.title (the long form title) for the cover header.
      await withRetry(
        "generate-cover",
        () => stepGenerateCover(ctx, db, generateCoverDeps),
        ctx,
      );
    }

    await ctx.markComplete(bookId);
    await notifySuccess(ctx, bookId);
  } catch (err) {
    await ctx.markFailed(err);
    await notifyFailure(ctx, err);
    throw err;
  }
}
