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
  analyzePage: (
    imageUrl: string,
    jobId: string,
    pageNumber: number,
    totalPages: number,
  ) => Promise<unknown>;
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
    // Pass page position so the LLM can tell the FRONT cover (page 1) apart from
    // internal title/intro pages that also carry big title text.
    const rawData = await deps.analyzePage(imageUrl, ctx.jobId, page.pageNumber, updatedPages.length);

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
  // interior pages and stepCreateBook partitions cover/intro correctly.
  //
  // Assign at most ONE cover: the first page classified as cover wins; any later
  // cover-flagged page is an internal title page → downgrade to intro. This stops
  // the LLM's common mistake of flagging both page 1 and an internal title page
  // as "cover" (which create-book would silently drop). `coverAssigned` also
  // disables classifyPage's page-1 fallback once a real cover exists.
  let coverAssigned = false;
  for (let i = 0; i < updatedPages.length; i++) {
    const p = updatedPages[i];
    const sig = (p.rawData ?? {}) as { isCover?: unknown; isIntro?: unknown; isInterior?: unknown };
    let { pageType } = classifyPage({
      pageNumber: p.pageNumber,
      isCover: sig.isCover === true,
      isIntro: sig.isIntro === true,
      isInterior: sig.isInterior === true,
      coverAlreadyAssigned: coverAssigned,
    });
    if (pageType === "cover") {
      if (coverAssigned) pageType = "interiorIntro";
      else coverAssigned = true;
    }
    updatedPages[i] = { ...p, pageType };
  }
  await db.cloneJob.update({
    where: { id: ctx.jobId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { pages: updatedPages as any },
  });

  await ctx.markStepComplete("analyze");
}
