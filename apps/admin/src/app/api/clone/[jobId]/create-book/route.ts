import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import type { CloneJob, CloneJobPage } from "@vx/server-core/ai/clone-types";
import { moveCloneJobImageToBook } from "@/lib/move-clone-page-to-book";
import { extractSourceStyleFromCover } from "./extract-source-style";

// AI style extraction (coloring + cover-design) runs inline, so allow a long budget.
export const maxDuration = 300;

type RouteParams = { params: Promise<{ jobId: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;
    const body = await req.json().catch(() => ({}));
    const { force, useRedesigned, metadata } = body as {
      force?: boolean;
      useRedesigned?: boolean;
      metadata?: {
        title?: string;
        subtitle?: string;
        description?: string;
        categoryId?: string;
        category?: string;
        badge?: string;
        price?: string;
      };
    };

    const row = await prisma.cloneJob.findUnique({ where: { id: jobId } });

    if (!row) {
      return NextResponse.json({ error: "Clone job not found" }, { status: 404 });
    }

    // If book already exists and not forced, return it
    if (row.bookId && !force) {
      return NextResponse.json({ success: true, bookId: row.bookId, alreadyExists: true });
    }

    const allPages = (row.pages as CloneJobPage[]) || [];
    const bookId = crypto.randomUUID();

    // Partition by D2 pageType — mirrors the worker's stepCreateBook partition
    // so worker-created and hand-created books are interchangeable downstream.
    // Excluded pages (operator-toggled back covers / blanks / junk) are dropped.
    const kept = allPages.filter((p) => !p.excluded && p.imageUrl);
    const coverPage = kept.find((p) => p.pageType === "cover");
    const introPages = kept.filter((p) => p.pageType === "interiorIntro");
    const interiorPages = kept
      .filter((p) => p.pageType !== "cover" && p.pageType !== "interiorIntro")
      .sort((a, b) => a.pageNumber - b.pageNumber);

    const buildPage = async (p: CloneJobPage, i: number) => {
      const sourceUrl = useRedesigned
        ? p.reproducedUrl || p.redesignedUrl || p.imageUrl
        : p.imageUrl;
      const url = await moveCloneJobImageToBook({ sourceUrl, bookId, pageIndex: i });
      return {
        id: crypto.randomUUID(),
        url,
        isPublic: false,
        prompt: p.redesignPrompt || p.rawData?.reproductionPrompt || "",
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
        sourcePageNumber: p.pageNumber,
        origin: p.origin ?? "original",
        ...(p.parentPageNumber != null ? { parentPageNumber: p.parentPageNumber } : {}),
      };
    };

    const coloringPages = await Promise.all(interiorPages.map((p, i) => buildPage(p, i)));
    // Offset summary indices so their moved keys never collide with interior keys.
    const summaryPages = await Promise.all(
      introPages.map((p, i) => buildPage(p, 1000 + i)),
    );
    const pages = allPages; // storyOutline below still walks every page

    // Build a story outline summary from all pages
    const storyOutline = pages
      .filter((p) => p.rawData)
      .map((p, i) => ({
        pageNumber: i + 1,
        scene: p.rawData!.scene?.description || "",
        characters: (p.rawData!.characters || []).map((c) => c.name),
        locations: (p.rawData!.locations || []).map((l) => l.name),
        mood: p.rawData!.environment?.mood || "",
      }));

    // Merge metadata from request > bookData > job defaults
    const m = metadata || {};
    const bd = (row.bookData as Partial<NonNullable<CloneJob["bookData"]>>) || {};

    // Auto-extract the source cover's coloring + text style from the job's first
    // colored image (usually the cover) so the cloned book keeps the original look.
    // Best-effort — never blocks book creation. Editable later in the cover editor.
    const coverSourceUrl = (coverPage ?? interiorPages[0])?.imageUrl || null;
    let sourceStyle: Awaited<ReturnType<typeof extractSourceStyleFromCover>> = {
      coloringStyleId: null,
      coloringVariantId: null,
      coverStylePack: null,
    };
    if (coverSourceUrl) {
      try {
        sourceStyle = await extractSourceStyleFromCover({
          coverImageUrl: coverSourceUrl,
          context: {
            title: m.title || bd.title || row.name || "Untitled",
            subtitle: m.subtitle || bd.subtitle || undefined,
            brandName: (row.data as { brand?: string } | null)?.brand || undefined,
            category: m.category || bd.category || undefined,
          },
        });
      } catch (error) {
        console.error("[clone/create-book] source style extraction failed:", error);
      }
    }

    const createdBook = await prisma.book.create({
      data: {
        id: bookId,
        title: m.title || bd.title || row.name || "Untitled",
        subtitle: m.subtitle || bd.subtitle || "",
        description: m.description || bd.description || "",
        categoryId: m.categoryId || bd.categoryId || null,
        category: m.category || bd.category || null,
        badge: m.badge || null,
        price: m.price || null,
        coloringPages: coloringPages as any,
        summaryPages: summaryPages as any,
        isPublic: false,
        data: {
          artStyleId: bd.artStyleId || null,
          status: "draft",
          specifications: { pages: coloringPages.length },
          storyOutline,
          isPremium: false,
          isConverted: false,
          isRedesigned: false,
          isEditionConverted: false,
          cloneJobId: jobId,
          // Source-cover style, auto-extracted (editable in the cover editor).
          coloringStyleId: sourceStyle.coloringStyleId,
          coloringVariantId: sourceStyle.coloringVariantId,
          // Cast: CoverDesignPack has no index signature, which Prisma's JSON input
          // type requires (same `as any` pattern as coloringPages above).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          coverStylePack: (sourceStyle.coverStylePack ?? null) as any,
          // The cover editor reads its base image from
          // `coverMeta.sourceThumbnailUrl` first (see cover-editor-screen.tsx).
          // Seed it with the MOVED, persistent first-page URL
          // (assets/{bookId}/pages/...), NOT the raw `pages[0].imageUrl`
          // (assets/clone-jobs/{jobId}/...): the job asset is transient and
          // gets purged over time, which would leave the editor opening blank.
          // Worker-created books get this from stepGenerateCover; manual
          // creation sets it here.
          coverMeta: coloringPages[0]?.url ? { sourceThumbnailUrl: coloringPages[0].url } : undefined,
        },
      },
    });

    await prisma.cloneJob.update({
      where: { id: jobId },
      data: { bookId: createdBook.id },
    });

    return NextResponse.json({ success: true, bookId: createdBook.id });
  } catch (error) {
    console.error("[clone/create-book] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
