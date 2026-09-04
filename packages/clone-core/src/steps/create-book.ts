import type { PrismaClient } from "@vx/db";
import type { JobContext } from "../job-context";
import { normalizeRawData } from "./book-page-meta";

/**
 * stepCreateBook — writes the final Book row from a finished CloneJob.
 *
 * Output schema matches the manual admin route
 * `apps/admin/src/app/api/clone/[jobId]/create-book/route.ts` so worker-created
 * books and user-created books are interchangeable downstream.
 *
 * Worker always prefers `redesignedUrl` over the original `imageUrl` (parity
 * with the manual route's `useRedesigned: true` mode) — the automated path
 * runs after the reproduce step, so the redesigned URL is always available.
 */

interface ExtractedChar {
  name: string;
  type?: string;
  role?: string;
  characterPrompt?: string;
}

interface ExtractedLoc {
  name: string;
  description?: string;
  locationPrompt?: string;
}

interface PageRawData {
  scene?: { description?: string; cameraView?: string; composition?: string };
  environment?: { timeOfDay?: string; weather?: string; season?: string; mood?: string };
  characters?: ExtractedChar[];
  locations?: ExtractedLoc[];
  reproductionPrompt?: string;
}

interface JobPage {
  pageNumber: number;
  imageUrl: string;
  redesignedUrl?: string;
  redesignPrompt?: string;
  rawData?: PageRawData;
  status?: string;
  error?: string;
  pageType?: "cover" | "interiorIntro" | "interior";
  excluded?: boolean;
  origin?: "original" | "additional";
  parentPageNumber?: number;
}

interface BookData {
  title?: string;
  subtitle?: string;
  description?: string;
  category?: string;
  categoryId?: string;
  ageRange?: string;
  artStyleId?: string;
}

export interface CreateBookDeps {
  randomUUID: () => string;
  /**
   * Moves a page image out of its clone-job storage location (source URL)
   * into the given permanent destination key, returning the new url.
   * clone-job assets (assets/clone-jobs/{jobId}/...) are purged over time
   * (see apps/worker/src/scripts/cleanup-failed.ts) — a published book must
   * not keep depending on that temporary storage. Returns sourceUrl
   * unchanged for URLs that aren't internal R2 paths (e.g. already empty).
   */
  copyImage: (args: { sourceUrl: string; destKey: string }) => Promise<string>;
}

export async function stepCreateBook(
  ctx: JobContext,
  db: PrismaClient,
  deps: CreateBookDeps,
): Promise<string> {
  if (ctx.resultBookId) return ctx.resultBookId;

  const job = await db.cloneJob.findUnique({ where: { id: ctx.jobId } });
  if (!job) throw new Error(`cloneJob ${ctx.jobId} missing`);

  const bookData = ((job.bookData as BookData | null | undefined) ?? {});
  const pages = (job.pages as JobPage[] | null | undefined) ?? [];
  const bookId = deps.randomUUID();

  // Denormalize the source book's niche onto the book so the list view can show
  // + search a niche tag without re-walking the CloneJob → SourceBook lineage.
  const jobData = (job.data as { sourceBookId?: string } | null | undefined) ?? {};
  let niche: string | null = null;
  if (jobData.sourceBookId) {
    const sourceBook = await db.sourceBook.findUnique({
      where: { id: jobData.sourceBookId },
      select: { niche: true },
    });
    niche = sourceBook?.niche?.trim() || null;
  }

  // A page is usable if it isn't an error page and has an image. Excluded
  // pages (operator-toggled back covers / blanks / junk) are dropped entirely.
  const usablePages = pages.filter(
    (p) => p.status !== "error" && !p.excluded && (p.redesignedUrl || p.imageUrl),
  );

  // Partition by D2 pageType. Legacy pages (no pageType) count as interior so
  // pre-D2 jobs behave exactly as before.
  const coverPage = usablePages.find((p) => p.pageType === "cover");
  const introPages = usablePages.filter((p) => p.pageType === "interiorIntro");
  const interiorPages = usablePages
    .filter((p) => p.pageType !== "cover" && p.pageType !== "interiorIntro")
    .sort((a, b) => a.pageNumber - b.pageNumber);

  const buildPage = async (p: JobPage, destKey: string) => {
    const sourceUrl = p.redesignedUrl ?? p.imageUrl;
    const url = await deps.copyImage({ sourceUrl, destKey });
    return {
      id: deps.randomUUID(),
      url,
      isPublic: false,
      prompt: p.redesignPrompt || p.rawData?.reproductionPrompt || "",
      sceneData: normalizeRawData(p.rawData),
      sourcePageNumber: p.pageNumber,
      origin: p.origin ?? "original",
      ...(p.parentPageNumber != null ? { parentPageNumber: p.parentPageNumber } : {}),
    };
  };

  const coloringPages = await Promise.all(
    interiorPages.map((p, i) => {
      const src = p.redesignedUrl ?? p.imageUrl;
      const ext = src.split(".").pop()?.split("?")[0] || "png";
      return buildPage(p, `assets/${bookId}/pages/page-${String(i + 1).padStart(3, "0")}.${ext}`);
    }),
  );

  const summaryPages = await Promise.all(
    introPages.map((p, i) => {
      const src = p.redesignedUrl ?? p.imageUrl;
      const ext = src.split(".").pop()?.split("?")[0] || "png";
      return buildPage(p, `assets/${bookId}/summary/summary-${String(i + 1).padStart(3, "0")}.${ext}`);
    }),
  );

  // Cover: move the classified cover page if present; otherwise mirror the
  // first interior page so coverUrl always points at a real, moved image.
  let coverUrl = coloringPages[0]?.url ?? "";
  if (coverPage) {
    const src = coverPage.redesignedUrl ?? coverPage.imageUrl;
    const ext = src.split(".").pop()?.split("?")[0] || "png";
    coverUrl = await deps.copyImage({ sourceUrl: src, destKey: `assets/${bookId}/cover.${ext}` });
  }
  const firstImage = coverUrl;

  const storyOutline = pages
    .filter((p) => p.rawData)
    .map((p, i) => ({
      pageNumber: i + 1,
      scene: p.rawData?.scene?.description ?? "",
      characters: (p.rawData?.characters ?? []).map((c) => c.name),
      locations: (p.rawData?.locations ?? []).map((l) => l.name),
      mood: p.rawData?.environment?.mood ?? "",
    }));

  const title =
    bookData.title || job.name || job.sourceFileName?.replace(/\.pdf$/i, "") || "Untitled";

  await db.book.create({
    data: {
      id: bookId,
      title,
      subtitle: bookData.subtitle || "",
      description: bookData.description || "",
      categoryId: bookData.categoryId ?? null,
      category: bookData.category ?? null,
      coverUrl: firstImage,
      thumbnailUrl: firstImage,
      squareThumbnailUrl: firstImage,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      coloringPages: coloringPages as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      summaryPages: summaryPages as any,
      isPublic: false,
      data: {
        ageRange: bookData.ageRange ?? null,
        artStyleId: bookData.artStyleId ?? null,
        status: "draft",
        specifications: { pages: coloringPages.length },
        storyOutline,
        isPremium: false,
        isConverted: false,
        isRedesigned: false,
        isEditionConverted: false,
        cloneJobId: ctx.jobId,
        sourceBookId: ctx.sourceBookId ?? null,
        ...(niche ? { niche, nicheLower: niche.toLowerCase() } : {}),
      },
    },
  });

  await db.cloneJob.update({
    where: { id: ctx.jobId },
    data: { resultBookId: bookId, bookId },
  });

  await ctx.markStepComplete("create-book");
  return bookId;
}
