import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import type { CloneJob } from "@/lib/ai/clone-types";

type RouteParams = { params: Promise<{ jobId: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;
    const body = await req.json().catch(() => ({}));
    const { force, useRedesigned } = body as { force?: boolean; useRedesigned?: boolean };

    const docRef = adminDb.collection("cloneJobs").doc(jobId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Clone job not found" }, { status: 404 });
    }

    const job = doc.data() as CloneJob & { bookId?: string };

    // If book already exists and not forced, return it
    if (job.bookId && !force) {
      return NextResponse.json({ success: true, bookId: job.bookId, alreadyExists: true });
    }

    const now = new Date().toISOString();
    const bookId = crypto.randomUUID();

    // Build coloringPages — use redesigned URLs if available and requested
    const coloringPages = job.pages
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
    const storyOutline = job.pages
      .filter((p) => p.rawData)
      .map((p, i) => ({
        pageNumber: i + 1,
        scene: p.rawData!.scene?.description || "",
        characters: (p.rawData!.characters || []).map((c) => c.name),
        locations: (p.rawData!.locations || []).map((l) => l.name),
        mood: p.rawData!.environment?.mood || "",
      }));

    await adminDb
      .collection("books")
      .doc(bookId)
      .set({
        title: job.bookData?.title || job.name || "Untitled",
        subtitle: job.bookData?.subtitle || "",
        description: job.bookData?.description || "",
        artStyleId: job.bookData?.artStyleId || null,
        status: "draft",
        coloringPages,
        summaryPages: [],
        specifications: { pages: coloringPages.length },
        storyOutline,
        isPublic: false,
        isPremium: false,
        isConverted: false,
        isRedesigned: false,
        isEditionConverted: false,
        cloneJobId: jobId,
        createdAt: now,
        updatedAt: now,
      });

    await docRef.update({ bookId, updatedAt: now });

    return NextResponse.json({ success: true, bookId });
  } catch (error) {
    console.error("[clone/create-book] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
