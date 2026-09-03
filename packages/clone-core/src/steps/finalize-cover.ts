import type { PrismaClient } from "@vx/db";
import { cieq } from "@vx/db";
import type { JobContext } from "../job-context";

export interface FinalizeCoverDeps {
  /**
   * Composite the title/subtitle/brand text onto the CLEAN cover illustration.
   * Real impl = generateAiCover from @vx/server-core/cover-generation (the same
   * function the admin Cover editor uses). A subset of GenerateCoverDeps, so the
   * worker can pass its existing generateCoverDeps straight in.
   */
  generateAiCover: (input: {
    cleanImageUrl: string;
    brandName: string;
    titleHint?: string;
    subtitleHint?: string;
    r2Key: string;
    trace?: { caller?: string; entityType?: string; entityId?: string };
  }) => Promise<{ url: string; base64: string }>;
  resolveR2Url: (url: string) => string;
}

/** Resolve the brand display name for the cover: brandId → name → first brand. */
async function resolveBrandName(db: PrismaClient, jobData: Record<string, unknown>): Promise<string> {
  const brandId = typeof jobData.brandId === "string" ? jobData.brandId.trim() : "";
  const brandName = typeof jobData.brand === "string" ? jobData.brand.trim() : "";
  let row = brandId ? await db.brand.findUnique({ where: { id: brandId } }) : null;
  if (!row && brandName) row = await db.brand.findFirst({ where: { name: cieq(brandName) } });
  if (!row) row = await db.brand.findFirst({ orderBy: { createdAt: "asc" } });
  if (!row) return brandName;
  const data = (row.data as Record<string, unknown> | null | undefined) ?? {};
  return (typeof data.displayName === "string" && data.displayName) || row.name;
}

/**
 * "Cover AI cuối" — bake the AI meta title/subtitle + brand onto the clean cover
 * illustration so the cloned book ships a FINISHED, text-baked coverUrl (parity
 * with the manual Cover editor's AI cover). Runs after generate-book-meta so it
 * uses the freshly generated title/subtitle. The clean squareThumbnail is kept
 * as the pre-text source for future cover re-generation.
 */
export async function stepFinalizeCover(
  ctx: JobContext,
  db: PrismaClient,
  deps: FinalizeCoverDeps,
): Promise<void> {
  const job = await db.cloneJob.findUnique({ where: { id: ctx.jobId } });
  if (!job) throw new Error(`cloneJob ${ctx.jobId} missing`);
  const bookId = job.resultBookId;
  if (!bookId) throw new Error(`cloneJob ${ctx.jobId} has no resultBookId`);

  const book = await db.book.findUnique({ where: { id: bookId } });
  if (!book) throw new Error(`book ${bookId} not found`);

  // Clean (text-free) illustration produced by generate-cover.
  const cleanRaw = book.squareThumbnailUrl || book.thumbnailUrl || book.coverUrl;
  if (!cleanRaw) {
    console.warn(`[stepFinalizeCover] book ${bookId} has no clean cover image — skipping`);
    await ctx.markStepComplete("finalize-cover");
    return;
  }

  const jobData = (job.data as Record<string, unknown> | null | undefined) ?? {};
  const brandName = await resolveBrandName(db, jobData);

  const { url } = await deps.generateAiCover({
    cleanImageUrl: deps.resolveR2Url(cleanRaw),
    brandName,
    titleHint: book.title || undefined,
    subtitleHint: book.subtitle || undefined,
    r2Key: `assets/${bookId}/cover.png`,
    trace: { caller: "clone/finalize-cover", entityType: "book", entityId: bookId },
  });

  await db.book.update({ where: { id: bookId }, data: { coverUrl: url } });
  console.log(`[stepFinalizeCover] book ${bookId} cover baked (brand="${brandName}")`);
  await ctx.markStepComplete("finalize-cover");
}
