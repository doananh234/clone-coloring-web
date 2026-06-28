import pino from "pino";
import { createWorker } from "./queue";
import "./firestore";
import { processCloneJob } from "./processor/clone-job-processor";
import { reconcileStaleJobs } from "./reconciler";

const logger = pino({ transport: { target: "pino-pretty" } });

async function main() {
  logger.info("worker booting");

  try {
    const recon = await reconcileStaleJobs();
    if (recon.recovered.length) {
      logger.info({ recovered: recon.recovered }, "reconciler re-enqueued stale jobs");
    }
  } catch (err) {
    logger.error({ err }, "reconciler failed at boot — continuing");
  }

  const worker = createWorker(async (job) => {
    const cloneJobId = (job.data as { cloneJobId: string }).cloneJobId;
    logger.info({ jobId: job.id, cloneJobId }, "processing job");
    await processCloneJob(cloneJobId);
  });

  worker.on("ready", () => logger.info("worker ready, concurrency=1"));
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "job failed"));
  worker.on("completed", (job) => logger.info({ jobId: job.id }, "job completed"));

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, async () => {
      logger.info({ signal }, "shutting down");
      await worker.close();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  logger.fatal({ err }, "worker boot failed");
  process.exit(1);
});
