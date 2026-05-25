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

    // Update clone job status to confirmed
    await docRef.update({
      bookData: body.bookData,
      status: "confirmed",
      updatedAt: now,
    });

    return NextResponse.json({
      success: true,
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
