/**
 * One-time cleanup: wipe the analyzed / rendered / cached data on every
 * STASHED ("tạm hoãn") clone job so the NEXT "Đưa lại queue" (unstash) runs the
 * pipeline completely fresh instead of reusing stale analysis that produces bad
 * results.
 *
 * Mirrors exactly what POST /clone/[jobId]/rerun clears, EXCEPT it does NOT
 * change the job status (stays "stashed") and does NOT re-enqueue — the user
 * still triggers the run manually via the existing "Đưa lại queue" button.
 *
 * Per job it:
 *   - clears the step cursor + failure markers on the clone job
 *     (data.oneShotSessionId / currentStep / failedStep / finishedAt)
 *   - wipes pages + analyzedPages so render / one-shot start over
 *   - drops the SourceBook-side Diaflow cache (data.oneShotPages /
 *     oneShotSessionId) → forces a NEW Diaflow call on the next run
 *   - detaches resultBookId + bookId so a NEW book is created next run.
 *     The OLD book is KEPT (orphaned) — delete it manually if unwanted.
 *
 * The SourceBook input (original pages/images) is untouched.
 *
 * Usage:
 *   yarn reset:stashed             # clear data on all status=stashed jobs
 *   yarn reset:stashed --dry-run   # only report what would change
 */
import { db } from "../db";

type JsonObj = Record<string, unknown>;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const tag = `[reset-stashed]${dryRun ? " [dry-run]" : ""}`;

  const jobs = await db.cloneJob.findMany({ where: { status: "stashed" } });
  console.log(`${tag} found ${jobs.length} stashed job(s)`);
  if (jobs.length === 0) return;

  let jobsCleared = 0;
  let sourceBooksCleared = 0;
  let booksDetached = 0;

  for (const row of jobs) {
    const prevData = ((row.data as JsonObj | null | undefined) ?? {});
    const {
      oneShotSessionId: _dropSession,
      currentStep: _dropStep,
      failedStep: _dropFailed,
      finishedAt: _dropFinished,
      ...keptData
    } = prevData;

    const sourceBookId = typeof keptData.sourceBookId === "string" ? keptData.sourceBookId : "";
    const hadPages = Array.isArray(row.pages) ? row.pages.length : 0;

    console.log(
      `${tag} job ${row.id} — pages=${hadPages} analyzedPages=${row.analyzedPages} ` +
      `resultBookId=${row.resultBookId ?? "—"} sourceBookId=${sourceBookId || "—"}`,
    );

    if (dryRun) {
      if (row.resultBookId) booksDetached++;
      jobsCleared++;
      if (sourceBookId) sourceBooksCleared++;
      continue;
    }

    // Drop the SourceBook-side Diaflow cache so stepOneShot can't reuse the same
    // output and reproduce the exact same bad result.
    if (sourceBookId) {
      const sb = await db.sourceBook.findUnique({ where: { id: sourceBookId } });
      if (sb) {
        const {
          oneShotSessionId: _sbSession,
          oneShotPages: _sbPages,
          // Part of the same cache record: it says which original pages
          // oneShotPages covers, so it must not outlive them.
          oneShotKeptPageNumbers: _sbKeptPages,
          ...sbKept
        } = ((sb.data as JsonObj | null | undefined) ?? {});
        await db.sourceBook.update({
          where: { id: sourceBookId },
          data: { data: sbKept as never },
        });
        sourceBooksCleared++;
      }
    }

    if (row.resultBookId) booksDetached++;

    await db.cloneJob.update({
      where: { id: row.id },
      data: {
        // status stays "stashed" — user re-queues manually via "Đưa lại queue".
        error: null,
        pages: [] as never,
        analyzedPages: 0,
        resultBookId: null,
        bookId: null,
        data: keptData as never,
      },
    });
    jobsCleared++;
  }

  console.log(
    `${tag} done — jobs cleared: ${jobsCleared}, source-book caches cleared: ` +
    `${sourceBooksCleared}, old books detached (kept): ${booksDetached}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
