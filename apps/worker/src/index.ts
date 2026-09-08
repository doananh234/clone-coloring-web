import pino from "pino";
import { setImageProviderConfigResolver } from "@vx/server-core/ai";
import { loadImageProviderConfig } from "@vx/db";
import { createWorker, createGenerationWorker } from "./queue";
import "./db";
import { reconcileOnBoot } from "./env";
import { processCloneJob } from "./processor/clone-job-processor";
import { processGenerationJob } from "./processor/generation-job-processor";
import { reconcileStaleJobs } from "./reconciler";

const logger = pino({ transport: { target: "pino-pretty" } });

// Feed the DB-backed image provider order into server-core's chain so the worker
// honors UI-changed primary/fallback priority without a redeploy (env is default).
setImageProviderConfigResolver(loadImageProviderConfig);

async function main() {
  logger.info("worker booting");

  if (reconcileOnBoot) {
    try {
      const recon = await reconcileStaleJobs();
      if (recon.recovered.length) {
        logger.info({ recovered: recon.recovered }, "reconciler re-enqueued stale jobs");
      }
    } catch (err) {
      logger.error({ err }, "reconciler failed at boot — continuing");
    }
  } else {
    logger.info("reconciler skipped at boot (set RECONCILE_ON_BOOT=true to enable in dev)");
  }

  const worker = createWorker(async (job) => {
    const cloneJobId = (job.data as { cloneJobId: string }).cloneJobId;
    logger.info({ jobId: job.id, cloneJobId }, "processing job");
    await processCloneJob(cloneJobId);
  });

  worker.on("ready", () => logger.info("worker ready, concurrency=1"));
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "job failed"));
  worker.on("completed", (job) => logger.info({ jobId: job.id }, "job completed"));

  // Background image-generation worker (source cover now; colorize later).
  const genWorker = createGenerationWorker(async (job) => {
    const generationJobId = (job.data as { generationJobId: string }).generationJobId;
    logger.info({ jobId: job.id, generationJobId }, "processing generation job");
    await processGenerationJob(generationJobId);
  });
  genWorker.on("ready", () => logger.info("generation worker ready, concurrency=2"));
  genWorker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "generation job failed"));
  genWorker.on("completed", (job) => logger.info({ jobId: job.id }, "generation job completed"));

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, async () => {
      logger.info({ signal }, "shutting down");
      await Promise.all([worker.close(), genWorker.close()]);
      process.exit(0);
    });
  }
}

main().catch((err) => {
  logger.fatal({ err }, "worker boot failed");
  process.exit(1);
});
