import pino from "pino";
import { env } from "../env";
import { db } from "../db";
import { formatSuccess, formatFailure } from "./format";

const logger = pino({ name: "telegram" });

interface MinimalCtx {
  jobId: string;
  sourceBookId?: string;
}

interface JobDataExtras {
  startedAt?: string;
  finishedAt?: string;
  failedStep?: string;
  retryHistory?: Array<{ step: string }>;
  sourceBookId?: string;
}

async function loadEnrichment(jobId: string) {
  const job = await db.cloneJob.findUnique({ where: { id: jobId } });
  const data = (job?.data as JobDataExtras | null | undefined) ?? {};
  let brand = "?";
  // Prefer the top-level relation field if present; fall back to data.sourceBookId.
  const sourceBookId = data.sourceBookId;
  if (sourceBookId) {
    const src = await db.sourceBook.findUnique({ where: { id: sourceBookId } });
    const srcData = (src?.data as { brand?: string } | null | undefined) ?? {};
    brand = srcData.brand ?? "?";
  }
  return {
    sourceFileName: job?.sourceFileName ?? "(unknown)",
    brand,
    totalPages: job?.totalPages ?? 0,
    startedAt: data.startedAt,
    finishedAt: data.finishedAt,
  };
}

async function send(chatId: string, text: string): Promise<void> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "MarkdownV2",
        disable_web_page_preview: false,
      }),
    });
    if (!res.ok) {
      logger.error({ status: res.status, body: await res.text() }, "telegram send failed");
    }
  } catch (err) {
    logger.error({ err }, "telegram send threw");
  }
}

export async function notifySuccess(ctx: MinimalCtx, bookId: string): Promise<void> {
  try {
    const e = await loadEnrichment(ctx.jobId);
    const text = formatSuccess({
      ...e,
      jobId: ctx.jobId,
      bookId,
      adminBaseUrl: env.ADMIN_BASE_URL,
    });
    await send(env.TELEGRAM_SUCCESS_CHAT_ID, text);
  } catch (err) {
    logger.error({ err, jobId: ctx.jobId }, "notifySuccess threw — swallowing");
  }
}

export async function notifyFailure(ctx: MinimalCtx, err: unknown): Promise<void> {
  try {
    const e = await loadEnrichment(ctx.jobId);
    const job = await db.cloneJob.findUnique({ where: { id: ctx.jobId } });
    const data = (job?.data as JobDataExtras | null | undefined) ?? {};
    const failedStep = data.failedStep ?? "unknown";
    const attempts = (data.retryHistory ?? []).filter((r) => r.step === failedStep).length;
    const text = formatFailure({
      sourceFileName: e.sourceFileName,
      brand: e.brand,
      jobId: ctx.jobId,
      failedStep,
      attempts,
      error: err instanceof Error ? err.message : String(err),
      adminBaseUrl: env.ADMIN_BASE_URL,
    });
    await send(env.TELEGRAM_FAIL_CHAT_ID, text);
  } catch (sendErr) {
    logger.error({ err: sendErr, jobId: ctx.jobId }, "notifyFailure threw — swallowing");
  }
}
