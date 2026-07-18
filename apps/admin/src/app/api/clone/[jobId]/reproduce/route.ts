import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { pickDifferentCameraView, type CameraView } from "@vx/server-core/ai/prompts";
import { getR2Config, createR2Client } from "@vx/server-core/r2";
import { flushLangfuse } from "@vx/server-core/langfuse";
import type { CloneJobPage } from "@vx/server-core/ai/clone-types";
import { generateVariation, patchJobPage, updateBookPageUrl } from "./helpers";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ jobId: string }> };

type EntityRef = { id: string; name: string; referenceImageUrl: string };
type EntityMap = { characters: EntityRef[]; locations: EntityRef[] };

type PageResult = {
  index: number;
  success: boolean;
  url?: string;
  cameraView?: CameraView;
  applied?: boolean;
  error?: string;
};

type JobRow = {
  bookId: string | null;
  pages: unknown;
  bookData: unknown;
  entityMap: unknown;
  name: string;
};

/**
 * Returns the job's book id, creating the book (empty page URLs, filled as
 * pages generate/apply) on first use — mirrors the legacy behavior where any
 * reproduce call bootstrapped the book.
 */
async function ensureBook(jobId: string, row: JobRow): Promise<string> {
  if (row.bookId) return row.bookId;

  const jobPages = (row.pages as CloneJobPage[]) || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobBookData = (row.bookData as any) || {};
  const entityMap: EntityMap = (row.entityMap as EntityMap) || { characters: [], locations: [] };

  const coloringPages = jobPages
    .filter((p) => p.imageUrl)
    .map((p) => {
      const charNames = (p.rawData?.characters || []).map((c) => c.name.toLowerCase().trim());
      const locNames = (p.rawData?.locations || []).map((l) => l.name.toLowerCase().trim());

      return {
        id: crypto.randomUUID(),
        url: "", // will be filled per page
        isPublic: false,
        prompt: p.rawData?.reproductionPrompt || "",
        characterReferenceImageUrls: entityMap.characters
          .filter((e) => charNames.includes(e.name.toLowerCase().trim()))
          .map((e) => e.referenceImageUrl),
        locationReferenceImageUrls: entityMap.locations
          .filter((e) => locNames.includes(e.name.toLowerCase().trim()))
          .map((e) => e.referenceImageUrl),
        sceneData: p.rawData
          ? {
              scene: p.rawData.scene,
              environment: p.rawData.environment,
              characters: (p.rawData.characters || []).map((c) => ({
                name: c.name,
                type: c.type,
                role: c.role,
                characterPrompt: c.characterPrompt,
              })),
              locations: (p.rawData.locations || []).map((l) => ({
                name: l.name,
                description: l.description,
                locationPrompt: l.locationPrompt,
              })),
            }
          : undefined,
        status: "pending" as const,
      };
    });

  const storyOutline = jobPages
    .filter((p) => p.rawData)
    .map((p, i) => ({
      pageNumber: i + 1,
      scene: p.rawData!.scene?.description || "",
      characters: (p.rawData!.characters || []).map((c) => c.name),
      locations: (p.rawData!.locations || []).map((l) => l.name),
      mood: p.rawData!.environment?.mood || "",
    }));

  const createdBook = await prisma.book.create({
    data: {
      title: jobBookData.title || row.name || "Untitled",
      subtitle: jobBookData.subtitle || "",
      description: jobBookData.description || "",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      coloringPages: coloringPages as any,
      summaryPages: [],
      isPublic: false,
      data: {
        status: "reproducing",
        specifications: { pages: coloringPages.length },
        storyOutline,
        entityMap,
        isPremium: false,
        isConverted: false,
        isRedesigned: false,
        isEditionConverted: false,
        cloneJobId: jobId,
      },
    },
  });

  await prisma.cloneJob.update({ where: { id: jobId }, data: { bookId: createdBook.id } });
  return createdBook.id;
}

/**
 * Per-page mode: generates a CANDIDATE (regen or new-angle) for one page.
 * The candidate is stored on cloneJob.pages[idx] only — the current result
 * (reproducedUrl) and the book stay untouched unless `apply` is set
 * (used by "Regenerate All", which keeps the old replace behavior).
 */
async function reproduceSinglePage(
  jobId: string,
  row: JobRow,
  pageIndex: number,
  newAngle: boolean,
  apply: boolean,
): Promise<NextResponse> {
  const jobPages = (row.pages as CloneJobPage[]) || [];
  const jobPage = jobPages[pageIndex];
  if (!jobPage) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  // Always anchor on the original redesign (never on a previous regen) so
  // repeated regens don't compound. Strip ?v= — R2 keys don't include it.
  const sourceImageUrl = (jobPage.redesignedUrl || jobPage.imageUrl || "").split("?")[0];
  if (!sourceImageUrl) {
    return NextResponse.json({ error: "No source image for this page" }, { status: 400 });
  }

  const kind = newAngle ? "angle" : "regen";
  // Exclude both the page's current view and the existing angle candidate's
  // view, so re-rolling an unapplied candidate still yields a fresh angle.
  const cameraView = newAngle
    ? pickDifferentCameraView([jobPage.rawData?.scene?.cameraView, jobPage.angleCandidateView])
    : undefined;

  const results: PageResult[] = [];
  let bookId = row.bookId;
  try {
    // Applying needs a book to point at — bootstrap it on first use, same as
    // the legacy combined handler did (covers "Regenerate All" before
    // "Create Book" was ever clicked).
    if (apply) {
      bookId = await ensureBook(jobId, row);
    }

    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);
    const paddedPage = String(jobPage.pageNumber).padStart(3, "0");
    const url = await generateVariation({
      sourceImageUrl,
      key: `assets/clone-jobs/${jobId}/reproduce/page-${paddedPage}-${kind}.png`,
      traceEntityId: jobId,
      cameraView,
      r2Client,
      r2Config,
    });

    await patchJobPage(jobId, pageIndex, (target) => ({
      ...target,
      ...(kind === "regen"
        ? { regenCandidateUrl: url }
        : { angleCandidateUrl: url, angleCandidateView: cameraView }),
      ...(apply
        ? {
            reproducedUrl: url,
            ...(cameraView && target.rawData
              ? {
                  rawData: {
                    ...target.rawData,
                    scene: { ...target.rawData.scene, cameraView },
                  },
                }
              : {}),
          }
        : {}),
    }));

    if (apply && bookId) {
      await updateBookPageUrl(bookId, pageIndex, url);
    }

    results.push({ index: pageIndex, success: true, url, cameraView, applied: apply });
  } catch (err) {
    results.push({
      index: pageIndex,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  await flushLangfuse();

  const succeeded = results.filter((r) => r.success).length;
  return NextResponse.json({
    success: true,
    bookId,
    total: results.length,
    succeeded,
    failed: results.length - succeeded,
    results,
  });
}

/**
 * Bulk mode (no pageIndex): initial generation for the manual pipeline.
 * Creates the book if needed and fills every pending page directly
 * (unchanged legacy behavior).
 */
async function reproducePendingPages(jobId: string, row: JobRow): Promise<NextResponse> {
  const jobPages = (row.pages as CloneJobPage[]) || [];

  const r2Config = getR2Config();
  const r2Client = createR2Client(r2Config);

  const bookId = await ensureBook(jobId, row);

  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const coloringPages = (book.coloringPages as any[]) || [];
  const pagesToGenerate = coloringPages
    .map((_: unknown, i: number) => i)
    .filter((i: number) => !coloringPages[i].url || coloringPages[i].status === "pending");

  const results: PageResult[] = [];

  for (const idx of pagesToGenerate) {
    const page = coloringPages[idx];
    const jobPage = jobPages[idx];
    const sourceImageUrl = (jobPage?.redesignedUrl || jobPage?.imageUrl || page.url || "").split(
      "?",
    )[0];
    if (!sourceImageUrl) {
      results.push({ index: idx, success: false, error: "No source image for this page" });
      continue;
    }

    try {
      coloringPages[idx].status = "generating";
      await prisma.book.update({
        where: { id: bookId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { coloringPages: coloringPages as any },
      });

      const url = await generateVariation({
        sourceImageUrl,
        key: `assets/${bookId}/pages/${page.id}.png`,
        traceEntityId: jobId,
        r2Client,
        r2Config,
      });

      coloringPages[idx].url = url;
      coloringPages[idx].status = "done";
      await prisma.book.update({
        where: { id: bookId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { coloringPages: coloringPages as any },
      });

      // Persist onto the clone job page too — the clone UI renders
      // job.pages[] after a reload.
      await patchJobPage(jobId, idx, (target) => ({ ...target, reproducedUrl: url }));

      results.push({ index: idx, success: true, url, applied: true });
    } catch (err) {
      coloringPages[idx].status = "error";
      await prisma.book.update({
        where: { id: bookId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { coloringPages: coloringPages as any },
      });
      results.push({
        index: idx,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Check if all pages are done
  const allDone = coloringPages.every(
    (p: { status: string }) => p.status === "done" || p.status === "error",
  );
  if (allDone) {
    // Persist final status via the `data` Json column since Book has no `status` scalar
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bookExtra = (book.data as any) || {};
    await prisma.book.update({
      where: { id: bookId },
      data: { data: { ...bookExtra, status: "draft" } },
    });
    await prisma.cloneJob.update({ where: { id: jobId }, data: { status: "reproduced" } });
  }

  const succeeded = results.filter((r) => r.success).length;

  await flushLangfuse();

  return NextResponse.json({
    success: true,
    bookId,
    total: results.length,
    succeeded,
    failed: results.length - succeeded,
    allDone,
    results,
  });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;
    const body = await req.json().catch(() => ({}));
    const { pageIndex, newAngle, apply } = body as {
      pageIndex?: number;
      newAngle?: boolean;
      apply?: boolean;
    };

    const row = await prisma.cloneJob.findUnique({ where: { id: jobId } });
    if (!row) {
      return NextResponse.json({ error: "Clone job not found" }, { status: 404 });
    }

    if (pageIndex !== undefined) {
      return reproduceSinglePage(jobId, row, pageIndex, !!newAngle, !!apply);
    }
    return reproducePendingPages(jobId, row);
  } catch (error) {
    console.error("[clone/reproduce] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
