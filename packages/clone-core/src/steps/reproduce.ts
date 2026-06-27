import type { Firestore } from "firebase-admin/firestore";
import type { JobContext } from "../job-context";

interface JobPage {
  pageNumber: number;
  imageUrl: string;
  status: string;
  rawData?: { reproductionPrompt?: string };
  redesignedUrl?: string;
}

export interface ReproduceDeps {
  generatePage: (args: {
    prompt: string;
    sourceImageUrl: string;
    pageNumber: number;
    jobId: string;
  }) => Promise<{ base64: string }>;
  uploadToR2: (args: { key: string; body: Buffer; contentType: string }) => Promise<{ url: string }>;
  resolveR2Url: (key: string) => string;
}

export async function stepReproduce(
  ctx: JobContext,
  db: Firestore,
  deps: ReproduceDeps,
): Promise<void> {
  const ref = db.collection("cloneJobs").doc(ctx.jobId);
  const snap = await ref.get();
  const job = snap.data() as { pages: JobPage[] };

  const updatedPages = [...job.pages];
  for (let i = 0; i < updatedPages.length; i++) {
    const page = updatedPages[i];
    if (page.redesignedUrl) continue;
    const prompt = page.rawData?.reproductionPrompt ?? "";
    if (!prompt) continue;

    const sourceImageUrl = deps.resolveR2Url(page.imageUrl);
    const img = await deps.generatePage({
      prompt,
      sourceImageUrl,
      pageNumber: page.pageNumber,
      jobId: ctx.jobId,
    });
    const key = `assets/clone-jobs/${ctx.jobId}/redesigned/page-${String(page.pageNumber).padStart(3, "0")}.png`;
    const { url } = await deps.uploadToR2({
      key,
      body: Buffer.from(img.base64, "base64"),
      contentType: "image/png",
    });
    updatedPages[i] = { ...page, redesignedUrl: url };
    await ref.update({
      pages: updatedPages,
      updatedAt: new Date().toISOString(),
    });
  }

  await ctx.markStepComplete("reproduce");
}
