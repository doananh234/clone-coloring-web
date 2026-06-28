import pino from "pino";
import { createWorker } from "./queue";
import "./firestore";

const logger = pino({ transport: { target: "pino-pretty" } });

async function main() {
  logger.info("worker booting");

  const worker = createWorker(async (job) => {
    logger.info({ jobId: job.id, data: job.data }, "received job (processor not wired yet)");
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
