import type { PrismaClient } from "@vx/db";
import type { JobContext } from "../job-context";
import type { CoverMeta } from "@vx/server-core/text-overlay";

/**
 * Post-create hook — colorizes the middle B&W page, then delegates cover
 * typography to the SHARED cover-generation module (single source of truth
 * for prompt + font selection + upload logic, also used by the admin's
 * /api/generate/cover-export). Updates the Book row with cover + clean
 * thumbnail + coverMeta.
 *
 * Runs after stepCreateBook (which sets fallback URLs from the first page).
 */

export interface GenerateCoverDeps {
  colorizeImage: (
    imageUrl: string,
    directive: string,
    opts?: { referenceImageUrls?: string[] },
  ) => Promise<{ base64: string; dataUrl: string }>;
  /**
   * AI cover generation, injected so tests can stub the LLM call. Real impl
   * is `generateAiCover` from `@vx/server-core/cover-generation` — same
   * function the admin's cover-export route uses.
   */
  generateAiCover: (input: {
    cleanImageUrl: string;
    brandName: string;
    titleHint?: string;
    subtitleHint?: string;
    r2Key: string;
    trace?: { caller?: string; entityType?: string; entityId?: string };
  }) => Promise<{ url: string; base64: string }>;
  uploadToR2: (args: {
    key: string;
    body: Buffer;
    contentType: string;
  }) => Promise<{ url: string }>;
  resolveR2Url: (key: string) => string;
}

interface JobPage {
  id?: string;
  url?: string;
}

interface BookDataWithCoverMeta {
  coverMeta?: CoverMeta;
  [k: string]: unknown;
}

export async function stepGenerateCover(
  ctx: JobContext,
  db: PrismaClient,
  deps: GenerateCoverDeps,
): Promise<void> {
  const job = await db.cloneJob.findUnique({ where: { id: ctx.jobId } });
  if (!job) throw new Error(`cloneJob ${ctx.jobId} missing`);
  const bookId = job.resultBookId;
  if (!bookId) throw new Error(`cloneJob ${ctx.jobId} has no resultBookId`);

  const book = await db.book.findUnique({ where: { id: bookId } });
  if (!book) throw new Error(`book ${bookId} not found`);

  // Everything below is wrapped so failures always leave a "failed" coverMeta
  // on the Book row (fallback URLs remain viewable).
  try {
    // 1. Brand + coloring style
    //
    // Resolution order:
    //   1) exact id match from job.data.brandId (fastest, most explicit)
    //   2) case-insensitive name match from job.data.brand (handles CSV
    //      imports whose name column drifted in casing/whitespace vs the
    //      Brand row on this DB)
    //   3) FIRST brand in the DB (safety net so cover generation never
    //      hard-fails on a CSV row whose brand is missing/misspelled — the
    //      operator can still edit the job later. Logged loudly so the drift
    //      is visible.)
    const jobDataForBrand = (job.data as Record<string, unknown> | null | undefined) ?? {};
    const snapshotBrandId = typeof jobDataForBrand.brandId === "string" ? jobDataForBrand.brandId.trim() : "";
    const snapshotBrandName = typeof jobDataForBrand.brand === "string" ? jobDataForBrand.brand.trim() : "";

    let brand: { id: string; name: string; data: Record<string, unknown> } | null = null;
    if (snapshotBrandId) {
      const row = await db.brand.findUnique({ where: { id: snapshotBrandId } });
      if (row) {
        brand = { id: row.id, name: row.name, data: (row.data as Record<string, unknown> | null | undefined) ?? {} };
      }
    }
    if (!brand && snapshotBrandName) {
      // Case-insensitive fallback: CSV imports may store the brand name with
      // a slightly different casing / trailing whitespace than the Brand row.
      // Postgres text `=` is case-sensitive so an exact match silently misses
      // "Didi Plums" vs "didi plums". Match `mode: "insensitive"` covers that,
      // and we compare against the trimmed snapshot so leading/trailing
      // whitespace in the CSV doesn't defeat it either.
      const row = await db.brand.findFirst({
        where: { name: { equals: snapshotBrandName, mode: "insensitive" } },
      });
      if (row) {
        brand = { id: row.id, name: row.name, data: (row.data as Record<string, unknown> | null | undefined) ?? {} };
      }
    }
    if (!brand) {
      // Last-resort fallback: pick the first brand in the DB (ordered by
      // createdAt so the choice is stable across retries). Cover generation
      // proceeds so the job doesn't dead-end; the operator can reassign the
      // brand later and regenerate the cover.
      const first = await db.brand.findFirst({ orderBy: { createdAt: "asc" } });
      if (first) {
        brand = {
          id: first.id,
          name: first.name,
          data: (first.data as Record<string, unknown> | null | undefined) ?? {},
        };
        console.warn(
          `[stepGenerateCover] no brand match for job ${ctx.jobId} ` +
            `(brandId="${snapshotBrandId}", brand="${snapshotBrandName}") — ` +
            `auto-selected first brand ${first.id} ("${first.name}").`,
        );
      }
    }
    if (!brand) {
      throw new Error(
        "No Brand rows exist — cannot generate cover. Create at least one Brand row.",
      );
    }

    // Pick a coloring style RANDOMLY from all usable styles rather than
    // always using the brand's default — gives covers across a whole batch
    // more visual variety per the operator's request. Falls back to the
    // brand default only if no other usable style exists in the DB. A
    // "usable" style must have a non-empty colorizationDirective (else
    // colorizeImage would throw further down).
    const usableStyles = await db.coloringStyle.findMany({
      where: {
        colorizationDirective: { not: null },
      },
      select: { id: true, colorizationDirective: true, referenceImages: true },
    });
    const stylesWithDirective = usableStyles.filter(
      (s) => typeof s.colorizationDirective === "string" && s.colorizationDirective.trim().length > 0,
    );
    if (stylesWithDirective.length === 0) {
      throw new Error(
        "No ColoringStyle rows have a non-empty colorizationDirective — cannot colorize cover.",
      );
    }
    const brandDefaultId =
      typeof brand.data.coloringStyleId === "string" ? brand.data.coloringStyleId : "";
    // Prefer a randomly-picked style that ISN'T the brand default when
    // possible — actively steer away from repeating the same look every
    // job. When only the brand default is available, fall back to it.
    const nonDefault = brandDefaultId
      ? stylesWithDirective.filter((s) => s.id !== brandDefaultId)
      : stylesWithDirective;
    const pool = nonDefault.length > 0 ? nonDefault : stylesWithDirective;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    const coloringStyleId = picked.id;
    const style = picked;
    console.log(
      `[stepGenerateCover] picked coloring style ${picked.id} from ${pool.length} candidate(s)` +
        (brandDefaultId ? ` (brand default was ${brandDefaultId})` : ""),
    );
    const referenceImageUrls = (
      (style.referenceImages as { url?: string }[] | null | undefined) ?? []
    )
      .map((r) => (typeof r.url === "string" ? deps.resolveR2Url(r.url) : ""))
      .filter(Boolean);

    // 2. Middle page
    const pages = (book.coloringPages as JobPage[] | null | undefined) ?? [];
    if (pages.length === 0) throw new Error("Book has no coloring pages");
    const middleIdx = Math.max(1, Math.floor(pages.length / 2));
    const middlePage = pages[middleIdx - 1];
    if (!middlePage?.url) throw new Error(`Middle page ${middleIdx} has no url`);

    // 3. Cover text — pulled from bookData (already populated by stepOneShot)
    const bookData = (job.bookData as Record<string, unknown> | null | undefined) ?? {};
    const titleCover =
      (typeof bookData.titleCover === "string" && bookData.titleCover) ||
      (typeof bookData.title === "string" && bookData.title) ||
      book.title ||
      "Coloring Book";
    const subtitle =
      (typeof bookData.subtitle === "string" && bookData.subtitle) || "";

    // 4. Colorize (colorizationDirective is guaranteed non-null by the
    //    stylesWithDirective filter above; cast to satisfy the compiler
    //    since Array.filter doesn't narrow through a boolean check).
    const colorized = await deps.colorizeImage(
      deps.resolveR2Url(middlePage.url),
      style.colorizationDirective as string,
      { referenceImageUrls },
    );
    const colorizedBuf = Buffer.from(colorized.base64, "base64");

    const thumbnailKey = `assets/clone-jobs/${ctx.jobId}/cover/thumbnail.png`;
    const { url: sourceThumbnailUrl } = await deps.uploadToR2({
      key: thumbnailKey,
      body: colorizedBuf,
      contentType: "image/png",
    });

    // 5. AI cover generation — delegates to the shared cover-generation
    //    module. Same prompt, font catalog, and brand-locking rules the
    //    admin's cover-export route uses. Feeds the CLEAN colorized
    //    thumbnail as input; the model composites title, subtitle, and
    //    brand text on top per the KDP-style spec.
    //
    //    Passing titleCover / subtitle as HINTS gives the model a starting
    //    point (from Diaflow's isCover-page extraction); the prompt tells
    //    it to prefer the hint but rewrite lightly if it clashes with the
    //    illustration.
    //
    //    Brand text = brand.data.displayName if the admin set one,
    //    otherwise the brand row's `name` slug. That gets rendered verbatim
    //    by the model at the bottom of the cover.
    const brandDisplay =
      (typeof brand.data.displayName === "string" && brand.data.displayName.trim()) ||
      brand.name;
    const coverKey = `assets/clone-jobs/${ctx.jobId}/cover/cover-ai.png`;
    const { url: coverUrl } = await deps.generateAiCover({
      cleanImageUrl: sourceThumbnailUrl,
      brandName: brandDisplay,
      titleHint: titleCover,
      subtitleHint: subtitle || undefined,
      r2Key: coverKey,
      trace: {
        caller: "worker/stepGenerateCover",
        entityType: "cloneJob",
        entityId: ctx.jobId,
      },
    });

    // 6. Update Book — coverUrl points at the AI-generated cover; thumbnail
    //    + squareThumbnail stay pointed at the clean colorized illustration
    //    (no text) so we can regenerate covers later without losing the
    //    pre-text source.
    const currentBookData = (book.data as BookDataWithCoverMeta | null | undefined) ?? {};
    await db.book.update({
      where: { id: book.id },
      data: {
        coverUrl,
        thumbnailUrl: sourceThumbnailUrl,
        squareThumbnailUrl: sourceThumbnailUrl,
        data: {
          ...currentBookData,
          coverMeta: {
            titleCover,
            subtitle,
            brandId: brand.id,
            coloringStyleId,
            sourceThumbnailUrl,
            middlePageIndex: middleIdx,
            presetId: "ai-typography",
            status: "generated" as const,
            generatedAt: new Date().toISOString(),
          },
        } as never,
      },
    });

    await ctx.markStepComplete("generate-cover");
  } catch (err) {
    // Mark coverMeta as failed so admin UI can show "Re-generate" easily.
    const errorMessage = err instanceof Error ? err.message : String(err);
    try {
      const currentBookData =
        (book.data as BookDataWithCoverMeta | null | undefined) ?? {};
      await db.book.update({
        where: { id: book.id },
        data: {
          data: {
            ...currentBookData,
            coverMeta: {
              ...(currentBookData.coverMeta ?? {}),
              status: "failed" as const,
              error: errorMessage,
              generatedAt: new Date().toISOString(),
            },
          } as never,
        },
      });
    } catch (patchErr) {
      console.error(
        "[stepGenerateCover] failed to patch coverMeta.status:",
        patchErr,
      );
    }
    throw err; // rethrow → cloneJob.status = "error"
  }
}
