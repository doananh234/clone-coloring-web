import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { enqueueCloneJob } from "@vx/clone-core/queue-enqueue";
import { cloneQueue } from "@/lib/queue/clone-queue";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ jobId: string }> };

/** Move a stashed job back to queued and re-add it to the BullMQ wait list. */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { jobId } = await params;

  const row = await prisma.cloneJob.findUnique({ where: { id: jobId } });
  if (!row) {
    return NextResponse.json({ error: "Clone job not found" }, { status: 404 });
  }
  if (row.status !== "stashed") {
    return NextResponse.json(
      { error: `Can only requeue stashed jobs (status: ${row.status})` },
      { status: 400 },
    );
  }

  await prisma.cloneJob.update({
    where: { id: jobId },
    data: { status: "queued" },
  });

  const result = await enqueueCloneJob(cloneQueue, jobId);

  return NextResponse.json({ jobId, ...result });
}
