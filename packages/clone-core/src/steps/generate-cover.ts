import type { PrismaClient } from "@vx/db";
import type { JobContext } from "../job-context";
import type { CoverMeta } from "@vx/server-core/text-overlay";
import { upsertColoringStyleWithVariant } from "./upsert-coloring-style-with-variant";

/**
 * Post-create hook — colorizes the middle B&W page AND recomposes it into a
 * text-free book-cover-source layout (main illustration in the lower 55–70%,
 * clean title-safe area up top with a sparse on-brand background pattern) via
 * a single combined image-to-image call (generateCoverSource). The result is
 * stored as the clean cover/thumbnail; typography is added on-demand later by
 * the SHARED cover-generation module (generateAiCover, also used by the admin's
 * /api/generate/cover-export). Updates the Book row with cover + clean
 * thumbnail + coverMeta.
 *
 * Runs after stepCreateBook (which sets fallback URLs from the first page).
 */

export interface GenerateCoverDeps {
  /**
   * Colorizes the B&W middle page AND recomposes it into a text-free
   * cover-source layout (main illustration in the lower 55–70%, clean
   * title-safe area up top with a sparse on-brand background pattern) in a
   * single combined image-to-image call. Real impl is `generateCoverSource`
   * from `@vx/server-core/ai`; injected so tests can stub the LLM call.
   */
  generateCoverSource: (
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
  /**
   * Extracts the coloring style (palette + colorization directive) FROM the
   * source page image so the cover keeps the original book's look — parity
   * with the admin's create-book route (extract-source-style.ts). Injected so
   * `clone-core` stays free of `@vx/server-core` and tests can stub the LLM.
   * Returns the raw parsed JSON of the style-extraction prompt.
   */
  extractColoringStyle: (
    sourceImageUrl: string,
  ) => Promise<Record<string, unknown>>;
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

    // Coloring style — extracted FROM the source page so the cover keeps the
    // original book's look, matching the admin create-book route. This replaces
    // the old random-pick behavior (which ignored the source entirely). A brand
    // has a default style used only as a fallback when source extraction can't
    // run (missing source image or LLM failure) — never a random style.
    //
    // The source image is job.pages[0].imageUrl: the original page (usually the
    // cover) that the PDF render seeded, the same input extract-source-style.ts
    // analyzes in the admin route.
    const jobPages =
      (job.pages as { imageUrl?: string }[] | null | undefined) ?? [];
    const sourceImageUrl = jobPages[0]?.imageUrl?.trim() || "";

    let coloringStyleId = "";
    let coloringVariantId = "";
    let style: {
      id: string;
      colorizationDirective: string | null;
      referenceImages: unknown;
    } | null = null;

    if (sourceImageUrl) {
      try {
        const parsed = await deps.extractColoringStyle(deps.resolveR2Url(sourceImageUrl));
        const directive =
          typeof parsed.colorizationDirective === "string"
            ? parsed.colorizationDirective.trim()
            : "";
        if (directive) {
          const bookData = (job.bookData as Record<string, unknown> | null | undefined) ?? {};
          const bookTitle =
            (typeof bookData.title === "string" && bookData.title) || book.title || "Untitled";
          // Dedupe by name: fold this palette into an existing same-named style
          // as a color variant instead of creating a duplicate style row.
          const upserted = await upsertColoringStyleWithVariant(db, parsed, {
            referenceUrl: sourceImageUrl,
            fallbackName: `${bookTitle} — style bìa gốc`,
            sourceBookId: ctx.sourceBookId ?? null,
          });
          coloringStyleId = upserted.styleId;
          coloringVariantId = upserted.variantId;
          const rawRef = (sourceImageUrl || "").split("?")[0];
          style = {
            id: upserted.styleId,
            colorizationDirective: directive,
            referenceImages: [{ url: rawRef, label: "source-cover" }],
          };
          console.log(
            `[stepGenerateCover] source coloring style ${upserted.styleId} variant ${upserted.variantId} ` +
              `(created=${upserted.created} deduped=${upserted.deduped}) for job ${ctx.jobId}`,
          );
        }
      } catch (error) {
        console.error(
          `[stepGenerateCover] source style extraction failed for job ${ctx.jobId} — falling back to brand default:`,
          error,
        );
      }
    }

    // Fallback: brand's default coloring style (never random) when source
    // extraction couldn't produce a usable directive.
    if (!style) {
      const brandDefaultId =
        typeof brand.data.coloringStyleId === "string" ? brand.data.coloringStyleId.trim() : "";
      if (brandDefaultId) {
        const row = await db.coloringStyle.findUnique({
          where: { id: brandDefaultId },
          select: { id: true, colorizationDirective: true, referenceImages: true },
        });
        if (row && typeof row.colorizationDirective === "string" && row.colorizationDirective.trim()) {
          coloringStyleId = row.id;
          style = row;
        }
      }
      if (!style) {
        // Last resort: any style in the DB with a non-empty directive so the
        // job doesn't dead-end (operator can regenerate the cover later).
        const usable = await db.coloringStyle.findMany({
          where: { colorizationDirective: { not: null } },
          select: { id: true, colorizationDirective: true, referenceImages: true },
        });
        const first = usable.find(
          (s) => typeof s.colorizationDirective === "string" && s.colorizationDirective.trim().length > 0,
        );
        if (first) {
          coloringStyleId = first.id;
          style = first;
        }
      }
      if (style) {
        console.warn(
          `[stepGenerateCover] using fallback coloring style ${coloringStyleId} for job ${ctx.jobId} (source extraction unavailable)`,
        );
      }
    }

    if (!style) {
      throw new Error(
        "No usable ColoringStyle available (source extraction failed and no fallback style with a non-empty colorizationDirective).",
      );
    }

    const referenceImageUrls = (
      (style.referenceImages as { url?: string }[] | null | undefined) ?? []
    )
      .map((r) => (typeof r.url === "string" ? deps.resolveR2Url(r.url) : ""))
      .filter(Boolean);

    // 2. Cover-source page — pick a RANDOM interior page (was: always the
    //    middle page). Random each run so retries / regenerations can surface a
    //    different illustration for the cover instead of locking to the middle.
    //    Stored below as coverMeta.middlePageIndex (kept for CoverMeta type
    //    compatibility; now holds the randomly-picked interior index).
    const pages = (book.coloringPages as JobPage[] | null | undefined) ?? [];
    if (pages.length === 0) throw new Error("Book has no coloring pages");
    const sourceIdx =
      pages.length === 1 ? 1 : Math.floor(Math.random() * pages.length) + 1;
    const sourcePage = pages[sourceIdx - 1];
    if (!sourcePage?.url)
      throw new Error(`Cover source page ${sourceIdx} has no url`);

    // 3. Cover text — pulled from bookData (already populated by stepOneShot)
    const bookData = (job.bookData as Record<string, unknown> | null | undefined) ?? {};
    const titleCover =
      (typeof bookData.titleCover === "string" && bookData.titleCover) ||
      (typeof bookData.title === "string" && bookData.title) ||
      book.title ||
      "Coloring Book";
    const subtitle =
      (typeof bookData.subtitle === "string" && bookData.subtitle) || "";

    // 4. Colorize + recompose into a cover-source layout in ONE combined call
    //    (colorizationDirective is guaranteed non-null by the fallback chain
    //    above; cast to satisfy the compiler since Array.filter doesn't narrow
    //    through a boolean check). Output is text-free — typography is added
    //    later by the Cover editor via generateAiCover.
    const colorized = await deps.generateCoverSource(
      deps.resolveR2Url(sourcePage.url),
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
    // CLEAN cover by default: use the text-free colorized illustration as the
    // cover — do NOT bake title/subtitle/brand onto it. Typography is added
    // on-demand later in the Cover editor (which still calls generateAiCover via
    // the cover-export route). titleCover/subtitle are kept in coverMeta below as
    // hints for that editor flow.
    const coverUrl = sourceThumbnailUrl;

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
            coloringVariantId,
            sourceThumbnailUrl,
            middlePageIndex: sourceIdx,
            presetId: "cover-source-recompose",
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
