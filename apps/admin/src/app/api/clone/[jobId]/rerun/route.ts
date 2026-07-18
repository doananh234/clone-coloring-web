import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { enqueueCloneJob } from "@vx/clone-core/queue-enqueue";
import { cloneQueue } from "@/lib/queue/clone-queue";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ jobId: string }> };

/**
 * Full re-run for a completed-but-bad job. Plain retry is a no-op for
 * "reproduced" jobs: currentStep sits at the last step so the worker skips
 * everything, and even with steps reset, stepOneShot would reuse the cached
 * Diaflow output (SourceBook.data.oneShotPages) and stepCreateBook would
 * early-return the existing resultBookId. This route resets ALL of that so
 * the pipeline runs fresh:
 *   - clears step cursor + failure markers on the clone job
 *   - wipes pages so render/one-shot start over
 *   - drops the cached Diaflow session/pages (forces a NEW Diaflow call —
 *     expect the usual one-shot duration and cost)
 *   - detaches resultBookId so a NEW book is created; the old book is kept
 *     and must be deleted manually if unwanted
 */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { jobId } = await params;

  const row = await prisma.cloneJob.findUnique({ where: { id: jobId } });
  if (!row) {
    return NextResponse.json({ error: "Clone job not found" }, { status: 404 });
  }

  const allowedStatuses = ["reproduced", "error", "stashed"];
  if (!allowedStatuses.includes(row.status)) {
    return NextResponse.json(
      { error: `Cannot re-run job in status: ${row.status}` },
      { status: 400 },
    );
  }

  const prevData = (row.data as Record<string, unknown> | null | undefined) ?? {};
  const {
    oneShotSessionId: _dropSession,
    currentStep: _dropStep,
    failedStep: _dropFailed,
    finishedAt: _dropFinished,
    ...keptData
  } = prevData;

  // Drop the SourceBook-side Diaflow cache, otherwise stepOneShot reuses the
  // same output and the re-run reproduces the exact same bad result.
  const sourceBookId = typeof keptData.sourceBookId === "string" ? keptData.sourceBookId : "";
  if (sourceBookId) {
    const sb = await prisma.sourceBook.findUnique({ where: { id: sourceBookId } });
    if (sb) {
      const {
        oneShotSessionId: _sbSession,
        oneShotPages: _sbPages,
        ...sbKept
      } = ((sb.data as Record<string, unknown> | null | undefined) ?? {});
      await prisma.sourceBook.update({
        where: { id: sourceBookId },
        data: { data: sbKept as never },
      });
    }
  }

  await prisma.cloneJob.update({
    where: { id: jobId },
    data: {
      status: "queued",
      error: null,
      pages: [] as never,
      analyzedPages: 0,
      resultBookId: null,
      bookId: null,
      data: keptData as never,
    },
  });

  const result = await enqueueCloneJob(cloneQueue, jobId);

  return NextResponse.json({ jobId, previousBookId: row.resultBookId, ...result });
}
