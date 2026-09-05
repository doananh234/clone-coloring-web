import type { PrismaClient } from "@vx/db";
import type { JobContext } from "../job-context";
import { classifyPage, type PageType } from "./classify-page";

interface JobPage {
  pageNumber: number;
  imageUrl: string;
  status: string;
  rawData?: unknown;
  pageType?: PageType;
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

  // Classification pass — turn the per-page isCover/isIntro/isInterior signals
  // from analyzePage into a concrete pageType, so stepReproduce only redesigns
  // interior pages and stepCreateBook partitions cover/intro correctly. Pre-scan
  // for an LLM-flagged cover first so the page-1 fallback doesn't also claim
  // "cover" before we reach the real cover page (mirrors stepOneShot).
  const llmFlaggedCover = updatedPages.some(
    (p) => (p.rawData as { isCover?: unknown } | null | undefined)?.isCover === true,
  );
  let coverAlreadyAssigned = llmFlaggedCover;
  for (let i = 0; i < updatedPages.length; i++) {
    const p = updatedPages[i];
    const sig = (p.rawData ?? {}) as { isCover?: unknown; isIntro?: unknown; isInterior?: unknown };
    const { pageType } = classifyPage({
      pageNumber: p.pageNumber,
      isCover: sig.isCover === true,
      isIntro: sig.isIntro === true,
      isInterior: sig.isInterior === true,
      coverAlreadyAssigned,
    });
    if (pageType === "cover") coverAlreadyAssigned = true;
    updatedPages[i] = { ...p, pageType };
  }
  await db.cloneJob.update({
    where: { id: ctx.jobId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { pages: updatedPages as any },
  });

  await ctx.markStepComplete("analyze");
}
