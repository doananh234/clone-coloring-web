import type { PrismaClient } from "@vx/db";
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
  db: PrismaClient,
  deps: AnalyzeDeps,
): Promise<void> {
  const job = await db.cloneJob.findUnique({ where: { id: ctx.jobId } });
  if (!job) throw new Error(`cloneJob ${ctx.jobId} missing`);
  const pages = (job.pages as JobPage[] | null | undefined) ?? [];

  const updatedPages = [...pages];
  let analyzedCount = updatedPages.filter((p) => p.status === "analyzed").length;

  for (let i = 0; i < updatedPages.length; i++) {
    const page = updatedPages[i];
    if (page.status === "analyzed" && page.rawData) continue;

    const imageUrl = deps.resolveR2Url(page.imageUrl);
    const rawData = await deps.analyzePage(imageUrl, ctx.jobId);

    analyzedCount++;
    updatedPages[i] = { ...page, status: "analyzed", rawData };

    await db.cloneJob.update({
      where: { id: ctx.jobId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { pages: updatedPages as any, analyzedPages: analyzedCount },
    });
  }

  await ctx.markStepComplete("analyze");
}
