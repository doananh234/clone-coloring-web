import type { Firestore } from "firebase-admin/firestore";
import type { JobContext } from "../job-context";

export interface RenderDeps {
  readPdfFromR2: (key: string) => Promise<Buffer>;
  renderPdfToImages: (pdf: ArrayBuffer) => Promise<Array<{ pageNumber: number; pngBuffer: Buffer }>>;
  uploadToR2: (args: { key: string; body: Buffer; contentType: string }) => Promise<unknown>;
}

export async function stepRender(
  ctx: JobContext,
  db: Firestore,
  deps: RenderDeps,
): Promise<void> {
  const ref = db.collection("cloneJobs").doc(ctx.jobId);
  const snap = await ref.get();
  const job = snap.data() as { sourcePdfUrl?: string };
  if (!job?.sourcePdfUrl) throw new Error("stepRender requires sourcePdfUrl on cloneJob");

  const pdfKey = job.sourcePdfUrl.replace(/^\//, "");
  const pdfBuffer = await deps.readPdfFromR2(pdfKey);
  const arrayBuffer = pdfBuffer.buffer.slice(
    pdfBuffer.byteOffset,
    pdfBuffer.byteOffset + pdfBuffer.byteLength,
  ) as ArrayBuffer;

  const rendered = await deps.renderPdfToImages(arrayBuffer);
  const pages: Array<{ pageNumber: number; imageUrl: string; status: "pending" }> = [];

  for (const r of rendered) {
    const pageKey = `assets/clone-jobs/${ctx.jobId}/pages/page-${String(r.pageNumber).padStart(3, "0")}.png`;
    await deps.uploadToR2({ key: pageKey, body: r.pngBuffer, contentType: "image/png" });
    pages.push({ pageNumber: r.pageNumber, imageUrl: `/${pageKey}`, status: "pending" });
  }

  await ref.update({
    pages,
    totalPages: pages.length,
    updatedAt: new Date().toISOString(),
  });
  await ctx.markStepComplete("render");
}
