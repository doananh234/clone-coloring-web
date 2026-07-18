/**
 * Safe (re-)enqueue for clone jobs on a BullMQ queue.
 *
 * All enqueue paths use a fixed `jobId` so a clone job maps 1:1 to a queue
 * record. BullMQ silently IGNORES `add()` when a job with the same custom
 * jobId already exists in ANY state — including `failed`/`completed`, which
 * are retained by removeOnFail/removeOnComplete. Without this guard, retry
 * and reconcile re-adds are no-ops for up to 30 days after a failure: the DB
 * says "queued" but nothing ever reaches the wait list.
 */

/** Structural subset of bullmq's Queue so clone-core needs no bullmq dependency. */
export interface CloneQueueLike {
  getJob(jobId: string): Promise<
    | {
        getState(): Promise<string>;
        remove(): Promise<unknown>;
      }
    | null
    | undefined
  >;
  add(
    name: string,
    data: { cloneJobId: string },
    opts: { jobId: string },
  ): Promise<unknown>;
}

export type EnqueueResult =
  | { enqueued: true }
  | { enqueued: false; state: string };

/**
 * Enqueue a clone job, clearing any stale terminal (failed/completed) record
 * that would otherwise make BullMQ silently drop the add. Jobs already
 * waiting/active/delayed are left untouched to avoid duplicates.
 */
export async function enqueueCloneJob(
  queue: CloneQueueLike,
  jobId: string,
): Promise<EnqueueResult> {
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state !== "failed" && state !== "completed") {
      return { enqueued: false, state };
    }
    try {
      await existing.remove();
    } catch {
      // Concurrent retry/resume/reconcile raced us and already removed (or is
      // re-processing) this job — treat as handled rather than failing the
      // whole batch.
      return { enqueued: false, state: "removed-concurrently" };
    }
  }
  await queue.add("process", { cloneJobId: jobId }, { jobId });
  return { enqueued: true };
}

export type RemoveResult =
  | { removed: true }
  | { removed: false; state: "missing" | "active" | "remove-failed" };

/**
 * Pull a clone job out of the BullMQ queue (for stashing). An `active` job is
 * left alone — the worker already owns it and BullMQ would refuse the remove
 * anyway. `remove-failed` means the job went active between the state check
 * and the remove; callers should treat it like `active`.
 */
export async function removeQueuedCloneJob(
  queue: CloneQueueLike,
  jobId: string,
): Promise<RemoveResult> {
  const existing = await queue.getJob(jobId);
  if (!existing) return { removed: false, state: "missing" };
  const state = await existing.getState();
  if (state === "active") return { removed: false, state: "active" };
  try {
    await existing.remove();
    return { removed: true };
  } catch {
    return { removed: false, state: "remove-failed" };
  }
}
