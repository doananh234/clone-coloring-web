import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { cloneQueue } from "@/lib/queue/clone-queue";
import { enqueueCloneJob } from "@vx/clone-core/queue-enqueue";
import { withQueueTimeout, isQueueTimeout, queueUnavailableResponse } from "@/lib/queue/queue-timeout";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ jobId: string }> };

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { jobId } = await params;

  await prisma.cloneJob.update({
    where: { id: jobId },
    data: { status: "queued" },
  });

  try {
    const result = await withQueueTimeout(enqueueCloneJob(cloneQueue, jobId));
    return NextResponse.json({ jobId, ...result });
  } catch (err) {
    if (isQueueTimeout(err)) return queueUnavailableResponse({ jobId });
    throw err;
  }
}
