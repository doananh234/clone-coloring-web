import { NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { removeQueuedCloneJob } from "@vx/clone-core/queue-enqueue";
import { cloneQueue } from "@/lib/queue/clone-queue";
import { withQueueTimeout, isQueueTimeout, queueUnavailableResponse } from "@/lib/queue/queue-timeout";

export const dynamic = "force-dynamic";

/**
 * Stash every queued job in one shot — clears the wait list so Resume only
 * runs jobs the user explicitly requeues (e.g. a single fixed book).
 */
export async function POST() {
  const queued = await prisma.cloneJob.findMany({
    where: { status: "queued" },
    select: { id: true },
  });

  const stashed: string[] = [];
  const skipped: string[] = [];
  for (const { id } of queued) {
    try {
      const removal = await withQueueTimeout(removeQueuedCloneJob(cloneQueue, id));
      if (!removal.removed && removal.state !== "missing") {
        // Worker already picked this one up — leave it alone.
        skipped.push(id);
        continue;
      }
      await prisma.cloneJob.update({
        where: { id },
        data: { status: "stashed" },
      });
      stashed.push(id);
    } catch (err) {
      // If Redis stops answering mid-loop, bail out rather than eating one
      // timeout per remaining job.
      if (isQueueTimeout(err)) {
        console.error("stash-all: queue went unreachable mid-loop; aborting", err);
        return queueUnavailableResponse({ stashed: stashed.length });
      }
      // One bad job must not abort stashing the rest.
      console.error(`stash-all: failed to stash clone job ${id}`, err);
      skipped.push(id);
    }
  }

  return NextResponse.json({ stashed: stashed.length, skipped: skipped.length });
}
