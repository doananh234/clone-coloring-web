import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { removeQueuedCloneJob } from "@vx/clone-core/queue-enqueue";
import { cloneQueue } from "@/lib/queue/clone-queue";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ jobId: string }> };

/**
 * Park a queued job so Resume / the reconciler won't run it. Pulls the job
 * out of the BullMQ wait list AND flips the DB status, otherwise the record
 * left in Redis would still be processed on resume.
 */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { jobId } = await params;

  const row = await prisma.cloneJob.findUnique({ where: { id: jobId } });
  if (!row) {
    return NextResponse.json({ error: "Clone job not found" }, { status: 404 });
  }
  if (row.status !== "queued") {
    return NextResponse.json(
      { error: `Can only stash queued jobs (status: ${row.status})` },
      { status: 400 },
    );
  }

  const removal = await removeQueuedCloneJob(cloneQueue, jobId);
  if (!removal.removed && removal.state !== "missing") {
    // active / remove-failed — the worker already owns this job.
    return NextResponse.json(
      { error: "Job is already being processed by the worker" },
      { status: 409 },
    );
  }

  await prisma.cloneJob.update({
    where: { id: jobId },
    data: { status: "stashed" },
  });

  return NextResponse.json({ jobId, stashed: true });
}
