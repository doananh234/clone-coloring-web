import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { resolveR2Url } from "@vx/server-core/r2";
import type { CloneJobBookData, CloneJobPage } from "@vx/server-core/ai/clone-types";
import { moveCloneJobImageToBook } from "@/lib/move-clone-page-to-book";

type RouteParams = { params: Promise<{ jobId: string }> };

type ConfirmBody = {
  bookData: CloneJobBookData;
  saveCharacters: number[]; // Page numbers to save characters from
  saveLocations: number[]; // Page numbers to save locations from
};

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;
    const body = (await req.json()) as ConfirmBody;

    const row = await prisma.cloneJob.findUnique({ where: { id: jobId } });

    if (!row) {
      return NextResponse.json({ error: "Clone job not found" }, { status: 404 });
    }

    const pages = (row.pages as CloneJobPage[]) || [];
    const savedCharacterIds: string[] = [];
    const savedLocationIds: string[] = [];

    // Save characters from selected pages
    for (const pageNum of body.saveCharacters || []) {
      const page = pages.find((p) => p.pageNumber === pageNum);
      if (!page?.rawData?.characters) continue;

      for (const char of page.rawData.characters) {
        const created = await prisma.character.create({
          data: {
            name: char.name,
            type: char.type || "character",
            role: char.role || "main_character",
            visualDna: (char.visualDna || {}) as any,
            characterPrompt: char.characterPrompt,
            tags: char.tags || [],
            sourceBookId: null,
            data: {
              sourcePageId: null,
              sourceImageUrl: resolveR2Url(page.imageUrl),
            },
          },
        });
        savedCharacterIds.push(created.id);
      }
    }

    // Save locations from selected pages
    for (const pageNum of body.saveLocations || []) {
      const page = pages.find((p) => p.pageNumber === pageNum);
      if (!page?.rawData?.locations) continue;

      for (const loc of page.rawData.locations) {
        const created = await prisma.location.create({
          data: {
            name: loc.name,
            description: loc.description || "",
            visualDescription: loc.visualDescription || "",
            locationPrompt: loc.locationPrompt,
            atmosphere: loc.atmosphere || {},
            props: loc.props || [],
            tags: loc.tags || [],
            sourceBookId: null,
            data: {
              sourcePageId: null,
              sourceImageUrl: resolveR2Url(page.imageUrl),
            },
          },
        });
        savedLocationIds.push(created.id);
      }
    }

    // Create a book from the cloned pages (persist full generation context).
    // Images are moved out of assets/clone-jobs/{jobId}/... into
    // assets/{bookId}/... here since clone-job assets are purged over time
    // (see apps/worker/src/scripts/cleanup-failed.ts) — a published book
    // must not keep depending on that temporary storage location.
    const bookId = crypto.randomUUID();
    const usablePages = pages.filter((p) => p.imageUrl);
    const coloringPages = await Promise.all(
      usablePages.map(async (p, i) => {
        const url = await moveCloneJobImageToBook({ sourceUrl: p.imageUrl, bookId, pageIndex: i });
        return {
          id: crypto.randomUUID(),
          url,
          isPublic: false,
          prompt: p.rawData?.reproductionPrompt || "",
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
        };
      }),
    );

    const storyOutline = pages
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
        id: bookId,
        title: body.bookData.title || row.name || "Untitled",
        subtitle: body.bookData.subtitle || "",
        description: body.bookData.description || "",
        coloringPages: coloringPages as any,
        summaryPages: [],
        isPublic: false,
        data: {
          artStyleId: body.bookData.artStyleId || null,
          status: "draft",
          specifications: { pages: coloringPages.length },
          storyOutline,
          isPremium: false,
          isConverted: false,
          isRedesigned: false,
          isEditionConverted: false,
          cloneJobId: jobId,
        },
      },
    });

    // Update clone job status to confirmed with book reference
    await prisma.cloneJob.update({
      where: { id: jobId },
      data: {
        bookData: body.bookData as any,
        bookId: createdBook.id,
        status: "confirmed",
      },
    });

    return NextResponse.json({
      success: true,
      bookId: createdBook.id,
      savedCharacters: savedCharacterIds,
      savedLocations: savedLocationIds,
    });
  } catch (error) {
    console.error("[clone/confirm] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
