import { Queue, Worker, type Processor } from "bullmq";
import IORedis from "ioredis";
import { env } from "./env";

export const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const cloneQueue = new Queue("clone-jobs", {
  connection: redis,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
    removeOnFail: { age: 30 * 24 * 3600 },
  },
});

export function createWorker(processor: Processor): Worker {
  return new Worker("clone-jobs", processor, {
    connection: redis,
    concurrency: 1,
    // KingCong image steps run ~150s+ each; keep the lock well above that so a
    // slow step is never mis-flagged as stalled and re-run. (600s)
    lockDuration: 600_000,
    stalledInterval: 30_000,
  });
}

// Background image-generation jobs (source cover now; colorize later). Kept on a
// separate queue so a gen backlog never blocks the clone pipeline. lockDuration
// is generous because a single Diaflow recompose can take ~2 minutes.
export const generationQueue = new Queue("generation-jobs", {
  connection: redis,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
    removeOnFail: { age: 30 * 24 * 3600 },
  },
});

export function createGenerationWorker(processor: Processor): Worker {
  return new Worker("generation-jobs", processor, {
    connection: redis,
    concurrency: 2,
    // 2-phase KingCong cover compose can take 300–600s; keep the lock at 600s.
    lockDuration: 600_000,
    stalledInterval: 30_000,
  });
}
