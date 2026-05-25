import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { resolveR2Url } from "@/lib/r2";
import type { CloneJob, CloneJobBookData } from "@/lib/ai/clone-types";

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

    const docRef = adminDb.collection("cloneJobs").doc(jobId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Clone job not found" }, { status: 404 });
    }

    const job = doc.data() as CloneJob;
    const now = new Date().toISOString();
    const savedCharacterIds: string[] = [];
    const savedLocationIds: string[] = [];

    // Save characters from selected pages
    for (const pageNum of body.saveCharacters || []) {
      const page = job.pages.find((p) => p.pageNumber === pageNum);
      if (!page?.rawData?.characters) continue;

      for (const char of page.rawData.characters) {
        const charId = crypto.randomUUID();
        await adminDb
          .collection("characters")
          .doc(charId)
          .set({
            id: charId,
            name: char.name,
            type: char.type || "character",
            role: char.role || "main_character",
            visualDna: char.visualDna || {},
            characterPrompt: char.characterPrompt,
            tags: char.tags || [],
            sourceBookId: null,
            sourcePageId: null,
            sourceImageUrl: resolveR2Url(page.imageUrl),
            createdAt: now,
            updatedAt: now,
          });
        savedCharacterIds.push(charId);
      }
    }

    // Save locations from selected pages
    for (const pageNum of body.saveLocations || []) {
      const page = job.pages.find((p) => p.pageNumber === pageNum);
      if (!page?.rawData?.locations) continue;

      for (const loc of page.rawData.locations) {
        const locId = crypto.randomUUID();
        await adminDb
          .collection("locations")
          .doc(locId)
          .set({
            id: locId,
            name: loc.name,
            description: loc.description || "",
            visualDescription: loc.visualDescription || "",
            locationPrompt: loc.locationPrompt,
            atmosphere: loc.atmosphere || {},
            props: loc.props || [],
            tags: loc.tags || [],
            sourceBookId: null,
            sourcePageId: null,
            sourceImageUrl: resolveR2Url(page.imageUrl),
            createdAt: now,
            updatedAt: now,
          });
        savedLocationIds.push(locId);
      }
    }

    // Create a book from the cloned pages (persist full generation context)
    const bookId = crypto.randomUUID();
    const coloringPages = job.pages
      .filter((p) => p.imageUrl)
      .map((p) => ({
        id: crypto.randomUUID(),
        url: p.imageUrl,
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
      }));

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
        title: body.bookData.title || job.name || "Untitled",
        subtitle: body.bookData.subtitle || "",
        description: body.bookData.description || "",
        artStyleId: body.bookData.artStyleId || null,
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

    // Update clone job status to confirmed with book reference
    await docRef.update({
      bookData: body.bookData,
      bookId,
      status: "confirmed",
      updatedAt: now,
    });

    return NextResponse.json({
      success: true,
      bookId,
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
