import { Queue } from "bullmq";
import IORedis from "ioredis";

// Separate BullMQ queue for background image-generation jobs (source cover now,
// colorize later). Mirrors clone-queue.ts — its own connection to the same Redis
// so a slow gen backlog never blocks the clone pipeline.
const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const generationQueue = new Queue("generation-jobs", {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
    removeOnFail: { age: 30 * 24 * 3600 },
  },
});

/** Enqueue a generation job. The BullMQ jobId is pinned to the DB row id so a
 *  row maps 1:1 to a queue record (retries/re-adds are idempotent). */
export async function enqueueGenerationJob(generationJobId: string): Promise<void> {
  await generationQueue.add(
    "process",
    { generationJobId },
    { jobId: generationJobId },
  );
}
