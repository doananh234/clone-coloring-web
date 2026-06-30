import type { PrismaClient } from "@vx/db";
import type { JobContext } from "../job-context";

export interface DownloadDeps {
  fetchPdf: (url: string) => Promise<Buffer>;
  uploadToR2: (args: { key: string; body: Buffer; contentType: string }) => Promise<unknown>;
}

export async function stepDownload(
  ctx: JobContext,
  db: PrismaClient,
  deps: DownloadDeps,
): Promise<void> {
  if (!ctx.sourceBookId) {
    throw new Error("stepDownload requires sourceBookId on cloneJob");
  }
  const src = await db.sourceBook.findUnique({ where: { id: ctx.sourceBookId } });
  if (!src) throw new Error(`sourceBook ${ctx.sourceBookId} missing`);

  // sourcePdfUrl is not a top-level field on SourceBook — it lives either in
  // `bookUrl` or inside the `data` Json blob. Prefer top-level `bookUrl`.
  const srcData = (src.data as { sourcePdfUrl?: string } | null | undefined) ?? {};
  const sourcePdfUrl = src.bookUrl ?? srcData.sourcePdfUrl;
  if (!sourcePdfUrl) {
    throw new Error(`sourceBook ${ctx.sourceBookId} has no bookUrl / sourcePdfUrl`);
  }

  const buffer = await deps.fetchPdf(sourcePdfUrl);
  const pdfKey = `assets/clone-jobs/${ctx.jobId}/source.pdf`;
  await deps.uploadToR2({ key: pdfKey, body: buffer, contentType: "application/pdf" });

  await db.cloneJob.update({
    where: { id: ctx.jobId },
    data: { sourcePdfUrl: `/${pdfKey}` },
  });
  await ctx.markStepComplete("download");
}
