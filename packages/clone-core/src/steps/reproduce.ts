import type { PrismaClient } from "@vx/db";
import type { JobContext } from "../job-context";
import type { PageType } from "./classify-page";

interface JobPage {
  pageNumber: number;
  imageUrl: string;
  status: string;
  rawData?: { reproductionPrompt?: string };
  redesignedUrl?: string;
  pageType?: PageType;
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
  db: PrismaClient,
  deps: ReproduceDeps,
): Promise<void> {
  const job = await db.cloneJob.findUnique({ where: { id: ctx.jobId } });
  if (!job) throw new Error(`cloneJob ${ctx.jobId} missing`);
  const pages = (job.pages as JobPage[] | null | undefined) ?? [];

  const updatedPages = [...pages];
  for (let i = 0; i < updatedPages.length; i++) {
    const page = updatedPages[i];
    if (page.redesignedUrl) continue;
    if (!page.imageUrl) continue;
    // Only INTERIOR pages get redesigned. Covers go through the cover pipeline
    // and intros stay as-is (create-book files them as summary pages). Legacy
    // pages with no pageType default to interior so pre-classification jobs are
    // unchanged.
    if (page.pageType && page.pageType !== "interior") continue;
    // prompt is no longer required — generatePage uses buildRedesignPrompt(30)
    // and ignores the passed-in prompt. We still pass it for signature compat.
    const prompt = page.rawData?.reproductionPrompt ?? "";

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
    await db.cloneJob.update({
      where: { id: ctx.jobId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { pages: updatedPages as any },
    });
  }

  await ctx.markStepComplete("reproduce");
}
