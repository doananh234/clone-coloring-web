import type { PrismaClient } from "@vx/db";
import type { JobContext } from "../job-context";
import { planPageSelection, type SelectablePage } from "./plan-page-selection";

export interface TrimPdfDeps {
  readPdfFromR2: (key: string) => Promise<Buffer>;
  /** Copies `keepIndices` (0-based) out of a PDF into a new one. */
  copyPdfPages: (pdf: Uint8Array, keepIndices: number[]) => Promise<Uint8Array>;
  uploadToR2: (args: { key: string; body: Buffer; contentType: string }) => Promise<{ url: string }>;
}

/**
 * Build the PDF that actually goes to Diaflow: the source minus every page the
 * operator dropped at the gate. Runs AFTER the gate and BEFORE stepOneShot, so
 * dropped pages never cost a generation.
 *
 * Writes two values other steps depend on:
 *   data.trimmedPdfUrl   — what stepOneShot sends
 *   data.keptPageNumbers — index map back to ORIGINAL page numbers, because the
 *                          trimmed PDF renumbers its pages 1..N
 *
 * When nothing was dropped it skips the copy and points at the original PDF,
 * so the common case costs no extra R2 round-trip.
 */
export async function stepTrimPdf(
  ctx: JobContext,
  db: PrismaClient,
  deps: TrimPdfDeps,
): Promise<void> {
  const job = await db.cloneJob.findUnique({ where: { id: ctx.jobId } });
  if (!job) throw new Error(`cloneJob ${ctx.jobId} missing`);
  if (!job.sourcePdfUrl) {
    throw new Error(`cloneJob ${ctx.jobId} has no sourcePdfUrl (run stepDownload/stepRender first)`);
  }

  const pages = (job.pages as SelectablePage[] | null | undefined) ?? [];
  const { keptPageNumbers } = planPageSelection(pages);
  const prevData = (job.data as Record<string, unknown> | null | undefined) ?? {};

  let trimmedPdfUrl = job.sourcePdfUrl;
  if (keptPageNumbers.length !== pages.length) {
    const pdfKey = job.sourcePdfUrl.replace(/^\//, "");
    const buffer = await deps.readPdfFromR2(pdfKey);
    const keepIndices = keptPageNumbers.map((n) => n - 1);
    const trimmed = await deps.copyPdfPages(new Uint8Array(buffer), keepIndices);
    const key = `assets/clone-jobs/${ctx.jobId}/source-trimmed.pdf`;
    const { url } = await deps.uploadToR2({
      key,
      body: Buffer.from(trimmed),
      contentType: "application/pdf",
    });
    trimmedPdfUrl = url;
  }

  await db.cloneJob.updateMany({
    where: { id: ctx.jobId },
    data: { data: { ...prevData, trimmedPdfUrl, keptPageNumbers } as never },
  });

  await ctx.markStepComplete("trim-pdf");
}
