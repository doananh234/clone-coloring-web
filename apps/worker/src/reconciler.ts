import { enqueueCloneJob } from "@vx/clone-core/queue-enqueue";
import { db } from "./db";
import { cloneQueue } from "./queue";

interface Deps {
  now?: () => Date;
  maxAgeMs?: number;
}

export async function reconcileStaleJobs(deps: Deps = {}): Promise<{ recovered: string[] }> {
  const now = (deps.now ?? (() => new Date()))();
  const maxAgeMs = deps.maxAgeMs ?? 15 * 60_000;
  const threshold = new Date(now.getTime() - maxAgeMs);

  const jobs = await db.cloneJob.findMany({
    where: {
      status: { in: ["queued", "running"] },
      updatedAt: { lt: threshold },
    },
    select: { id: true },
  });

  const recovered: string[] = [];
  for (const { id } of jobs) {
    try {
      const result = await enqueueCloneJob(cloneQueue, id);
      if (result.enqueued) recovered.push(id);
    } catch (err) {
      // One bad job must not abort recovery of the rest.
      console.error(`reconciler: failed to re-enqueue clone job ${id}`, err);
    }
  }
  return { recovered };
}
