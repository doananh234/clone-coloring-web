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

  // Skip pages stepOneShot marked as failed — those have no redesignedUrl
  // and shipping them would surface the raw B&W original as a "coloring
  // page". Filter must otherwise match the URL fallback below: a page is
  // usable if EITHER redesignedUrl or imageUrl is set. Strict `p.imageUrl`
  // filter dropped every page when stepOneShot left imageUrl empty (older
  // bug: Diaflow's loop_N_output was missing) — producing a book with 0
  // coloringPages.
  const usablePages = pages.filter((p) => p.status !== "error" && (p.redesignedUrl || p.imageUrl));

  const coloringPages = await Promise.all(
    usablePages.map(async (p, i) => {
      const sourceUrl = p.redesignedUrl ?? p.imageUrl;
      const ext = sourceUrl.split(".").pop()?.split("?")[0] || "png";
      const destKey = `assets/${bookId}/pages/page-${String(i + 1).padStart(3, "0")}.${ext}`;
      const url = await deps.copyImage({ sourceUrl, destKey });
      return {
        id: deps.randomUUID(),
        url,
        isPublic: false,
        prompt: p.redesignPrompt || p.rawData?.reproductionPrompt || "",
        // Persist full per-page LLM output — enables future indexing/search.
        // normalizeRawData keeps every field but guards non-object rawData: the
        // old `{ ...p.rawData }` spread a JSON string into numeric keys ("0".."N"),
        // which is the malformed sceneData seen on existing books.
        sceneData: normalizeRawData(p.rawData),
      };
    }),
  );

  const storyOutline = pages
    .filter((p) => p.rawData)
    .map((p, i) => ({
      pageNumber: i + 1,
      scene: p.rawData?.scene?.description ?? "",
      characters: (p.rawData?.characters ?? []).map((c) => c.name),
      locations: (p.rawData?.locations ?? []).map((l) => l.name),
      mood: p.rawData?.environment?.mood ?? "",
    }));

  const firstImage = coloringPages[0]?.url ?? "";
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
      summaryPages: [],
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
