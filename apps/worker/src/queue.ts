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
    lockDuration: 60_000,
    stalledInterval: 30_000,
  });
}
