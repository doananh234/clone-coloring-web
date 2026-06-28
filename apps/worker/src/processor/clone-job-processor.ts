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
import { db } from "../firestore";
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
  await db.collection("cloneJobs").doc(jobId).update({
    status: "running",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  try {
    if (!ctx.isDone("download"))         await withRetry("download",         () => stepDownload(ctx, db, downloadDeps),                 ctx);
    if (!ctx.isDone("render"))           await withRetry("render",           () => stepRender(ctx, db, renderDeps),                     ctx);
    if (!ctx.isDone("analyze"))          await withRetry("analyze",          () => stepAnalyze(ctx, db, analyzeDeps),                   ctx);
    if (!ctx.isDone("extract-entities")) await withRetry("extract-entities", () => stepExtractEntities(ctx, db, extractEntitiesDeps),   ctx);
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
