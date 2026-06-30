import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { editImage } from "@vx/server-core/ai";
import { buildRedesignPrompt } from "@vx/server-core/ai/prompts";
import { getR2Config, createR2Client, uploadToR2, resolveR2Url } from "@vx/server-core/r2";
import { flushLangfuse } from "@vx/server-core/langfuse";
import type { CloneJobPage } from "@vx/server-core/ai/clone-types";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ jobId: string }> };

type EntityRef = { id: string; name: string; referenceImageUrl: string };
type EntityMap = { characters: EntityRef[]; locations: EntityRef[] };

/**
 * Reproduce a single page: image-to-image edit using the same KEEP/MAY/DO NOT
 * template as the Redesign step (no scene re-description, ~30% change).
 */
async function reproducePage(
  sourceImageUrl: string,
  bookId: string,
  pageId: string,
  r2Client: ReturnType<typeof createR2Client>,
  r2Config: ReturnType<typeof getR2Config>,
) {
  const fullPrompt = buildRedesignPrompt(30);
  const img = await editImage(resolveR2Url(sourceImageUrl), fullPrompt, {
    trace: { caller: "clone/reproduce", entityType: "book", entityId: bookId },
  });

  const base64 = img.base64 || img.dataUrl?.split(",")[1] || "";
  const buffer = Buffer.from(base64, "base64");
  const key = `assets/${bookId}/pages/${pageId}.png`;
  const { url } = await uploadToR2({
    client: r2Client,
    config: r2Config,
    key,
    body: buffer,
    contentType: "image/png",
  });

  return url;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;
    const body = await req.json().catch(() => ({}));
    const { pageIndex } = body as { pageIndex?: number };

    const row = await prisma.cloneJob.findUnique({ where: { id: jobId } });

    if (!row) {
      return NextResponse.json({ error: "Clone job not found" }, { status: 404 });
    }

    const jobPages = (row.pages as CloneJobPage[]) || [];
    const jobBookData = (row.bookData as any) || {};
    const entityMap: EntityMap = (row.entityMap as EntityMap) || { characters: [], locations: [] };

    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);

    // Create or reuse book
    let bookId = row.bookId || "";
    if (!bookId) {
      // Build initial coloringPages with prompts but no generated URLs yet
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

      bookId = createdBook.id;
      await prisma.cloneJob.update({
        where: { id: jobId },
        data: { bookId },
      });
    }

    // Read current book state
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const coloringPages = (book.coloringPages as any[]) || [];

    // Determine which pages to generate
    const pagesToGenerate: number[] =
      pageIndex !== undefined
        ? [pageIndex]
        : coloringPages
            .map((_: unknown, i: number) => i)
            .filter((i: number) => !coloringPages[i].url || coloringPages[i].status === "pending");

    const results: { index: number; success: boolean; url?: string; error?: string }[] = [];

    for (const idx of pagesToGenerate) {
      const page = coloringPages[idx];
      const jobPage = jobPages[idx];
      if (!page) {
        results.push({ index: idx, success: false, error: "Page not found" });
        continue;
      }

      // Use redesigned image if available, otherwise original from clone job
      const sourceImageUrl = jobPage?.redesignedUrl || jobPage?.imageUrl || page.url || "";
      if (!sourceImageUrl) {
        results.push({ index: idx, success: false, error: "No source image for this page" });
        continue;
      }

      try {
        // Update status to generating
        coloringPages[idx].status = "generating";
        await prisma.book.update({
          where: { id: bookId },
          data: { coloringPages: coloringPages as any },
        });

        const url = await reproducePage(sourceImageUrl, bookId, page.id, r2Client, r2Config);

        coloringPages[idx].url = url;
        coloringPages[idx].status = "done";
        await prisma.book.update({
          where: { id: bookId },
          data: { coloringPages: coloringPages as any },
        });

        results.push({ index: idx, success: true, url });
      } catch (err) {
        coloringPages[idx].status = "error";
        await prisma.book.update({
          where: { id: bookId },
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
      const bookExtra = (book.data as any) || {};
      await prisma.book.update({
        where: { id: bookId },
        data: { data: { ...bookExtra, status: "draft" } },
      });
      await prisma.cloneJob.update({
        where: { id: jobId },
        data: { status: "reproduced" },
      });
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    await flushLangfuse();

    return NextResponse.json({
      success: true,
      bookId,
      total: results.length,
      succeeded,
      failed,
      allDone,
      results,
    });
  } catch (error) {
    console.error("[clone/reproduce] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
