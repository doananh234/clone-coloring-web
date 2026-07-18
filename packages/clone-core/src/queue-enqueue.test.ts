import { describe, it, expect, vi } from "vitest";
import {
  enqueueCloneJob,
  removeQueuedCloneJob,
  type CloneQueueLike,
} from "./queue-enqueue";

const JOB_ID = "job-1";

function fakeQueue(existing?: { state: string; remove?: ReturnType<typeof vi.fn> }) {
  const remove = existing?.remove ?? vi.fn().mockResolvedValue(undefined);
  const add = vi.fn().mockResolvedValue(undefined);
  const getJob = vi.fn().mockResolvedValue(
    existing
      ? { getState: vi.fn().mockResolvedValue(existing.state), remove }
      : undefined,
  );
  const queue: CloneQueueLike = { getJob, add };
  return { queue, add, getJob, remove };
}

describe("enqueueCloneJob", () => {
  it("adds the job when no record exists in the queue", async () => {
    const { queue, add } = fakeQueue();
    const result = await enqueueCloneJob(queue, JOB_ID);
    expect(result).toEqual({ enqueued: true });
    expect(add).toHaveBeenCalledWith("process", { cloneJobId: JOB_ID }, { jobId: JOB_ID });
  });

  it("removes a stale failed record before re-adding (BullMQ dedupes by jobId)", async () => {
    const { queue, add, remove } = fakeQueue({ state: "failed" });
    const result = await enqueueCloneJob(queue, JOB_ID);
    expect(remove).toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith("process", { cloneJobId: JOB_ID }, { jobId: JOB_ID });
    expect(result).toEqual({ enqueued: true });
  });

  it("removes a stale completed record before re-adding", async () => {
    const { queue, add, remove } = fakeQueue({ state: "completed" });
    const result = await enqueueCloneJob(queue, JOB_ID);
    expect(remove).toHaveBeenCalled();
    expect(add).toHaveBeenCalled();
    expect(result).toEqual({ enqueued: true });
  });

  it("does not duplicate a job that is already waiting", async () => {
    const { queue, add, remove } = fakeQueue({ state: "waiting" });
    const result = await enqueueCloneJob(queue, JOB_ID);
    expect(remove).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(result).toEqual({ enqueued: false, state: "waiting" });
  });

  it("treats a concurrent removal as already handled instead of throwing", async () => {
    const remove = vi.fn().mockRejectedValue(new Error("could not be removed"));
    const { queue, add } = fakeQueue({ state: "failed", remove });
    const result = await enqueueCloneJob(queue, JOB_ID);
    expect(add).not.toHaveBeenCalled();
    expect(result).toEqual({ enqueued: false, state: "removed-concurrently" });
  });

  it("does not touch a job that is actively running", async () => {
    const { queue, add, remove } = fakeQueue({ state: "active" });
    const result = await enqueueCloneJob(queue, JOB_ID);
    expect(remove).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(result).toEqual({ enqueued: false, state: "active" });
  });
});

describe("removeQueuedCloneJob", () => {
  it("removes a waiting job from the queue", async () => {
    const { queue, remove } = fakeQueue({ state: "waiting" });
    const result = await removeQueuedCloneJob(queue, JOB_ID);
    expect(remove).toHaveBeenCalled();
    expect(result).toEqual({ removed: true });
  });

  it("reports missing when the job is not in the queue at all", async () => {
    const { queue, remove } = fakeQueue();
    const result = await removeQueuedCloneJob(queue, JOB_ID);
    expect(remove).not.toHaveBeenCalled();
    expect(result).toEqual({ removed: false, state: "missing" });
  });

  it("refuses to remove an actively running job", async () => {
    const { queue, remove } = fakeQueue({ state: "active" });
    const result = await removeQueuedCloneJob(queue, JOB_ID);
    expect(remove).not.toHaveBeenCalled();
    expect(result).toEqual({ removed: false, state: "active" });
  });

  it("reports remove-failed when the job goes active mid-remove", async () => {
    const remove = vi.fn().mockRejectedValue(new Error("locked by worker"));
    const { queue } = fakeQueue({ state: "waiting", remove });
    const result = await removeQueuedCloneJob(queue, JOB_ID);
    expect(result).toEqual({ removed: false, state: "remove-failed" });
  });
});
