import { NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { enqueueCloneJob } from "@vx/clone-core/queue-enqueue";
import { cloneQueue } from "@/lib/queue/clone-queue";

export const dynamic = "force-dynamic";

// A "running" DB job younger than this may still be actively processed by the
// worker; only re-enqueue it once it has clearly gone stale (same threshold
// as the worker's boot reconciler).
const RUNNING_STALE_MS = 15 * 60_000;

/**
 * Resume the queue AND reconcile it against the DB. Unpausing alone is not
 * enough: jobs can be "queued" in the DB while missing from the BullMQ wait
 * list (Redis wiped on restart, or a stale failed record swallowed a re-add
 * via jobId dedupe). Re-enqueue those so Resume always restarts real work.
 */
export async function POST() {
  await cloneQueue.resume();

  const staleThreshold = new Date(Date.now() - RUNNING_STALE_MS);
  const dbQueued = await prisma.cloneJob.findMany({
    where: {
      OR: [
        { status: "queued" },
        { status: "running", updatedAt: { lt: staleThreshold } },
      ],
    },
    select: { id: true },
  });

  const requeued: string[] = [];
  const errors: string[] = [];
  for (const { id } of dbQueued) {
    try {
      const result = await enqueueCloneJob(cloneQueue, id);
      if (result.enqueued) requeued.push(id);
    } catch (err) {
      // One bad job must not abort reconciliation of the rest.
      console.error(`resume: failed to re-enqueue clone job ${id}`, err);
      errors.push(id);
    }
  }

  return NextResponse.json({
    resumed: true,
    requeued: requeued.length,
    errors: errors.length,
  });
}
