const MD_SPECIAL = /[_*\[\]()~`>#+\-=|{}.!\\]/g;

export function escapeMd(text: string): string {
  return text.replace(MD_SPECIAL, (c) => `\\${c}`);
}

function formatDuration(startedAt?: string, finishedAt?: string): string {
  if (!startedAt || !finishedAt) return "?";
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export interface SuccessFields {
  sourceFileName: string;
  brand: string;
  totalPages: number;
  jobId: string;
  startedAt?: string;
  finishedAt?: string;
  bookId: string;
  adminBaseUrl?: string;
}

export function formatSuccess(f: SuccessFields): string {
  const link = f.adminBaseUrl ? `${f.adminBaseUrl}/books/${f.bookId}` : `(book ${f.bookId})`;
  return [
    "✅ Book cloned",
    `Source: ${escapeMd(f.sourceFileName)}`,
    `Brand: ${escapeMd(f.brand)}`,
    `Pages: ${f.totalPages}`,
    `Took: ${escapeMd(formatDuration(f.startedAt, f.finishedAt))}`,
    `Book: ${escapeMd(link)}`,
  ].join("\n");
}

export interface FailureFields {
  sourceFileName: string;
  brand: string;
  jobId: string;
  failedStep: string;
  attempts: number;
  error: string;
  adminBaseUrl?: string;
}

export function formatFailure(f: FailureFields): string {
  const retryLink = f.adminBaseUrl ? `${f.adminBaseUrl}/clone?job=${f.jobId}` : `(job ${f.jobId})`;
  return [
    "❌ Clone failed",
    `Source: ${escapeMd(f.sourceFileName)}`,
    `Brand: ${escapeMd(f.brand)}`,
    `Step: ${escapeMd(f.failedStep)}  (${f.attempts}/${f.attempts} attempts)`,
    `Error: ${escapeMd(f.error)}`,
    `Retry: ${escapeMd(retryLink)}`,
  ].join("\n");
}
