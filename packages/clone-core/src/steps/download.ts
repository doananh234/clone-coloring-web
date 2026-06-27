import type { Firestore } from "firebase-admin/firestore";
import type { JobContext } from "../job-context";

export interface DownloadDeps {
  fetchPdf: (url: string) => Promise<Buffer>;
  uploadToR2: (args: { key: string; body: Buffer; contentType: string }) => Promise<unknown>;
}

export async function stepDownload(
  ctx: JobContext,
  db: Firestore,
  deps: DownloadDeps,
): Promise<void> {
  if (!ctx.sourceBookId) {
    throw new Error("stepDownload requires sourceBookId on cloneJob");
  }
  const srcSnap = await db.collection("sourceBooks").doc(ctx.sourceBookId).get();
  if (!srcSnap.exists) throw new Error(`sourceBook ${ctx.sourceBookId} missing`);
  const src = srcSnap.data() as { sourcePdfUrl: string };

  const buffer = await deps.fetchPdf(src.sourcePdfUrl);
  const pdfKey = `assets/clone-jobs/${ctx.jobId}/source.pdf`;
  await deps.uploadToR2({ key: pdfKey, body: buffer, contentType: "application/pdf" });

  await db.collection("cloneJobs").doc(ctx.jobId).update({
    sourcePdfUrl: `/${pdfKey}`,
    updatedAt: new Date().toISOString(),
  });
  await ctx.markStepComplete("download");
}
