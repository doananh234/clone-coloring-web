import { z } from "zod";

const schema = z.object({
  REDIS_URL: z.string().min(1),
  DATABASE_URL: z.string().url(),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_SUCCESS_CHAT_ID: z.string().min(1),
  TELEGRAM_FAIL_CHAT_ID: z.string().min(1),
  ADMIN_BASE_URL: z.string().url().optional(),
  NODE_ENV: z.string().optional(),
  // Re-enqueue jobs stuck in queued/running at boot. This is heavy: it reprocesses
  // the whole stale backlog, and with `node --watch` every restart re-runs it —
  // which is what pins CPU/RAM in local dev. Default: only in production.
  // Force with "true"/"1" or "false"/"0".
  RECONCILE_ON_BOOT: z.enum(["true", "false", "1", "0"]).optional(),
});

export type WorkerEnv = z.infer<typeof schema>;

export function parseEnv(raw: NodeJS.ProcessEnv | Record<string, string | undefined>): WorkerEnv {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const msg = result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    throw new Error(`Invalid env: ${msg}`);
  }
  return result.data;
}

export const env: WorkerEnv = parseEnv(process.env);

/**
 * Whether to run the stale-job reconciler at boot. Defaults on only in
 * production so local dev (esp. under `node --watch`) doesn't re-enqueue and
 * reprocess the backlog on every restart.
 */
export const reconcileOnBoot: boolean =
  env.RECONCILE_ON_BOOT != null
    ? env.RECONCILE_ON_BOOT === "true" || env.RECONCILE_ON_BOOT === "1"
    : env.NODE_ENV === "production";
