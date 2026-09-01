import type { PrismaClient } from "@vx/db";
import type { JobContext } from "../job-context";

/** Full book metadata from AI vision (mirrors server-core BookMetaGenerationResult). */
export interface GeneratedBookMeta {
  title?: string;
  subtitle?: string;
  description?: string;
  badge?: string;
  backgroundColor?: string;
  categoryId?: string;
  category?: string;
  price?: string;
  ageRange?: string;
  dimensions?: string;
  tags?: string[];
  primaryColor?: string;
  secondaryColor?: string;
  themeStyle?: string;
  holiday?: string;
  occasion?: string;
  etsyListing?: Record<string, unknown>;
}

export interface CategoryOption {
  id: string;
  displayName: string;
}

export interface GenerateBookMetaDeps {
  /**
   * Vision-analyze the cover image → full book meta. Injected so clone-core stays
   * free of @vx/server-core; real impl = buildBookMetaPrompt + visionAnalyzeJSON.
   */
  generateBookMeta: (coverImageUrl: string, categories: CategoryOption[]) => Promise<GeneratedBookMeta>;
  resolveR2Url: (url: string) => string;
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/**
 * Post-cover step: generate the FULL book meta (title/subtitle/description, 13
 * tags, Etsy listing, colors, badge, price, category, specs…) FROM the generated
 * cover image — the same rich meta the manual "Sinh meta AI" button produces — so
 * every cloned book ships complete without manual editing.
 *
 * Runs after generate-cover (so a cover image exists to analyze). Merges into the
 * book NON-destructively: real columns updated, everything else folded into
 * Book.data without dropping existing keys.
 */
export async function stepGenerateBookMeta(
  ctx: JobContext,
  db: PrismaClient,
  deps: GenerateBookMetaDeps,
): Promise<void> {
  const job = await db.cloneJob.findUnique({ where: { id: ctx.jobId } });
  if (!job) throw new Error(`cloneJob ${ctx.jobId} missing`);
  const bookId = job.resultBookId;
  if (!bookId) throw new Error(`cloneJob ${ctx.jobId} has no resultBookId`);

  const book = await db.book.findUnique({ where: { id: bookId } });
  if (!book) throw new Error(`book ${bookId} not found`);

  const coverRaw = book.squareThumbnailUrl || book.coverUrl || book.thumbnailUrl;
  if (!coverRaw) {
    console.warn(`[stepGenerateBookMeta] book ${bookId} has no cover image — skipping meta`);
    await ctx.markStepComplete("generate-book-meta");
    return;
  }

  const categories: CategoryOption[] = (
    await db.category.findMany({
      orderBy: { index: "asc" },
      select: { id: true, displayName: true, name: true },
    })
  ).map((c) => ({ id: c.id, displayName: c.displayName || c.name || c.id }));

  const meta = await deps.generateBookMeta(deps.resolveR2Url(coverRaw), categories);

  // --- Split meta → real Book columns vs Book.data blob (non-destructive) ---
  const curData = (book.data as Record<string, unknown> | null | undefined) ?? {};
  const spec = { ...((curData.specifications as Record<string, unknown> | undefined) ?? {}) };
  if (str(meta.ageRange)) spec.ageRange = str(meta.ageRange);
  if (str(meta.dimensions)) spec.dimensions = str(meta.dimensions);

  const columns: Record<string, unknown> = {};
  const setCol = (k: string, v?: string) => {
    if (v) columns[k] = v;
  };
  setCol("title", str(meta.title));
  setCol("subtitle", str(meta.subtitle));
  setCol("description", str(meta.description));
  setCol("badge", str(meta.badge));
  setCol("backgroundColor", str(meta.backgroundColor));
  setCol("price", str(meta.price));
  // Only accept a categoryId the model actually matched to a real Category row.
  const matchedCat = categories.find((c) => c.id === str(meta.categoryId));
  if (matchedCat) {
    columns.categoryId = matchedCat.id;
    columns.category = str(meta.category) || matchedCat.displayName;
  } else if (str(meta.category)) {
    columns.category = str(meta.category);
  }

  const data: Record<string, unknown> = {
    ...curData,
    specifications: spec,
    ...(Array.isArray(meta.tags) ? { tags: meta.tags } : {}),
    ...(str(meta.primaryColor) ? { primaryColor: str(meta.primaryColor) } : {}),
    ...(str(meta.secondaryColor) ? { secondaryColor: str(meta.secondaryColor) } : {}),
    ...(str(meta.themeStyle) ? { themeStyle: str(meta.themeStyle) } : {}),
    ...(str(meta.holiday) ? { holiday: str(meta.holiday) } : {}),
    ...(str(meta.occasion) ? { occasion: str(meta.occasion) } : {}),
    ...(meta.etsyListing && typeof meta.etsyListing === "object"
      ? { etsyListing: meta.etsyListing }
      : {}),
  };

  await db.book.update({
    where: { id: bookId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { ...columns, data: data as any },
  });
  console.log(
    `[stepGenerateBookMeta] book ${bookId} meta done (cols=${Object.keys(columns).length}, tags=${meta.tags?.length ?? 0})`,
  );

  await ctx.markStepComplete("generate-book-meta");
}
