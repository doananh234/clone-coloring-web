import {
  JobContext,
  withRetry,
  stepDownload,
  stepRender,
  stepAnalyze,
  stepExtractEntities,
  stepReproduce,
  stepCreateBook,
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
} from "./step-deps";

export async function processCloneJob(jobId: string): Promise<void> {
  const ctx = await JobContext.load(db, jobId);
  // TODO: previously also set `startedAt`; no top-level column in CloneJob schema.
  // If needed, persist via the `data` Json column.
  await db.cloneJob.update({
    where: { id: jobId },
    data: { status: "running" },
  });

  try {
    if (!ctx.isDone("download"))         await withRetry("download",         () => stepDownload(ctx, db, downloadDeps),                 ctx);
    if (!ctx.isDone("render"))           await withRetry("render",           () => stepRender(ctx, db, renderDeps),                     ctx);
    if (!ctx.isDone("analyze"))          await withRetry("analyze",          () => stepAnalyze(ctx, db, analyzeDeps),                   ctx);
    // extract-entities skipped in auto flow — mark complete so the UI step-progress display advances past it.
    // User can still trigger /api/clone/[jobId]/extract-entities manually after the book is ready.
    // To re-enable auto extraction, replace the marker line below with:
    //   await withRetry("extract-entities", () => stepExtractEntities(ctx, db, extractEntitiesDeps), ctx);
    if (!ctx.isDone("extract-entities")) await ctx.markStepComplete("extract-entities");
    if (!ctx.isDone("reproduce"))        await withRetry("reproduce",        () => stepReproduce(ctx, db, reproduceDeps),               ctx);

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
