import type { PrismaClient } from "@vx/db";
import type { JobContext } from "../job-context";

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

  // Filter must match the URL fallback below: a page is usable if EITHER
  // redesignedUrl or imageUrl is set. Strict `p.imageUrl` filter dropped every
  // page when stepOneShot left imageUrl empty (older bug: Diaflow's
  // loop_N_output was missing) — producing a book with 0 coloringPages.
  const coloringPages = pages
    .filter((p) => p.redesignedUrl || p.imageUrl)
    .map((p) => ({
      id: deps.randomUUID(),
      url: p.redesignedUrl ?? p.imageUrl,
      isPublic: false,
      prompt: p.redesignPrompt || p.rawData?.reproductionPrompt || "",
      // Persist full per-page LLM output — enables future indexing/search.
      sceneData: p.rawData ? { ...p.rawData } : undefined,
    }));

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
  const bookId = deps.randomUUID();
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
