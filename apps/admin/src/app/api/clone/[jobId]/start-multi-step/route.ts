import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { cloneQueue } from "@/lib/queue/clone-queue";
import { enqueueCloneJob } from "@vx/clone-core/queue-enqueue";
import { withQueueTimeout, isQueueTimeout, queueUnavailableResponse } from "@/lib/queue/queue-timeout";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ jobId: string }> };

/**
 * Start a clone job using the legacy multi-step pipeline (render → analyze →
 * reproduce). The default worker behavior is the Diaflow one-shot pipeline;
 * this route is the explicit opt-out for a single job.
 *
 * Mirrors POST /api/clone/[jobId]/start except it flips
 * cloneJob.data.useMultiStep = true so processCloneJob takes the multi-step
 * branch when it picks the job up.
 */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { jobId } = await params;

  const job = await prisma.cloneJob.findUnique({ where: { id: jobId } });
  if (!job) {
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  }

  const prevData = (job.data as Record<string, unknown> | null | undefined) ?? {};
  await prisma.cloneJob.update({
    where: { id: jobId },
    data: {
      status: "queued",
      data: { ...prevData, useMultiStep: true } as never,
    },
  });

  try {
    const result = await withQueueTimeout(enqueueCloneJob(cloneQueue, jobId));
    return NextResponse.json({ jobId, mode: "multi-step", ...result });
  } catch (err) {
    if (isQueueTimeout(err)) return queueUnavailableResponse({ jobId, mode: "multi-step" });
    throw err;
  }
}
