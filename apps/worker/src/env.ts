import { z } from "zod";

const schema = z.object({
  REDIS_URL: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_SUCCESS_CHAT_ID: z.string().min(1),
  TELEGRAM_FAIL_CHAT_ID: z.string().min(1),
  ADMIN_BASE_URL: z.string().url().optional(),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().min(1),
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
