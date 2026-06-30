import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import type { CloneJob, CloneJobPage } from "@vx/server-core/ai/clone-types";

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

    // Build coloringPages — use redesigned URLs if available and requested
    const coloringPages = pages
      .filter((p) => p.imageUrl)
      .map((p) => ({
        id: crypto.randomUUID(),
        url: (useRedesigned && p.redesignedUrl) ? p.redesignedUrl : p.imageUrl,
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
      }));

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

    const createdBook = await prisma.book.create({
      data: {
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
