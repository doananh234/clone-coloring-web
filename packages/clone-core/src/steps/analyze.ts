import type { Firestore } from "firebase-admin/firestore";
import type { JobContext } from "../job-context";

interface JobPage {
  pageNumber: number;
  imageUrl: string;
  status: string;
  rawData?: unknown;
  error?: string;
}

export interface AnalyzeDeps {
  analyzePage: (imageUrl: string, jobId: string) => Promise<unknown>;
  resolveR2Url: (key: string) => string;
}

export async function stepAnalyze(
  ctx: JobContext,
  db: Firestore,
  deps: AnalyzeDeps,
): Promise<void> {
  const ref = db.collection("cloneJobs").doc(ctx.jobId);
  const snap = await ref.get();
  const job = snap.data() as { pages: JobPage[] };

  const updatedPages = [...job.pages];
  let analyzedCount = updatedPages.filter((p) => p.status === "analyzed").length;

  for (let i = 0; i < updatedPages.length; i++) {
    const page = updatedPages[i];
    if (page.status === "analyzed" && page.rawData) continue;

    const imageUrl = deps.resolveR2Url(page.imageUrl);
    const rawData = await deps.analyzePage(imageUrl, ctx.jobId);

    analyzedCount++;
    updatedPages[i] = { ...page, status: "analyzed", rawData };

    await ref.update({
      pages: updatedPages,
      analyzedPages: analyzedCount,
      updatedAt: new Date().toISOString(),
    });
  }

  await ctx.markStepComplete("analyze");
}
