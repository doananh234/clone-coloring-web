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

    const pages = (row.pages as CloneJobPage[]) || [];
    const bookId = crypto.randomUUID();

    // Build coloringPages — use redesigned URLs if available and requested.
    // Images are moved out of assets/clone-jobs/{jobId}/... into
    // assets/{bookId}/... here since clone-job assets are purged over time
    // (see apps/worker/src/scripts/cleanup-failed.ts) — a published book
    // must not keep depending on that temporary storage location.
    const usablePages = pages.filter((p) => p.imageUrl);
    const coloringPages = await Promise.all(
      usablePages.map(async (p, i) => {
        const sourceUrl = useRedesigned ? p.reproducedUrl || p.redesignedUrl || p.imageUrl : p.imageUrl;
        const url = await moveCloneJobImageToBook({ sourceUrl, bookId, pageIndex: i });
        return {
          id: crypto.randomUUID(),
          url,
          isPublic: false,
          prompt: p.redesignPrompt || p.rawData?.reproductionPrompt || "",
          // Store structured scene data so redesign knows characters/locations/mood
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
    const coverSourceUrl = pages[0]?.imageUrl || null;
    let sourceStyle: Awaited<ReturnType<typeof extractSourceStyleFromCover>> = {
      coloringStyleId: null,
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
        summaryPages: [],
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
          // Cast: CoverDesignPack has no index signature, which Prisma's JSON input
          // type requires (same `as any` pattern as coloringPages above).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          coverStylePack: (sourceStyle.coverStylePack ?? null) as any,
          // The cover editor reads its base image from
          // `coverMeta.sourceThumbnailUrl` first (see cover-editor-screen.tsx).
          // Seed it with the source cover / first-page image so the editor
          // opens WITH a background instead of blank. Worker-created books get
          // this from stepGenerateCover; manual creation sets it here.
          coverMeta: coverSourceUrl ? { sourceThumbnailUrl: coverSourceUrl } : undefined,
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
