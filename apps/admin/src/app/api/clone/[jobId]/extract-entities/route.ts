import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { generateCharacterReference, generateLocationReference } from "@/lib/ai";
import { getR2Config, createR2Client, uploadToR2 } from "@/lib/r2";
import type { CloneJob, ExtractedCharacter, ExtractedLocation } from "@/lib/ai/clone-types";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ jobId: string }> };

type SavedEntity = {
  id: string;
  name: string;
  type: "character" | "location";
  referenceImageUrl: string;
  status: "success" | "error";
  error?: string;
};

export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;
    const docRef = adminDb.collection("cloneJobs").doc(jobId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Clone job not found" }, { status: 404 });
    }

    const job = doc.data() as CloneJob;
    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);
    const now = new Date().toISOString();
    const results: SavedEntity[] = [];

    // Deduplicate characters across all pages
    const charMap = new Map<string, { char: ExtractedCharacter; sourcePageImageUrl: string }>();
    for (const page of job.pages) {
      if (!page.rawData?.characters) continue;
      for (const char of page.rawData.characters) {
        const key = char.name.toLowerCase().trim();
        if (!charMap.has(key)) {
          charMap.set(key, { char, sourcePageImageUrl: page.imageUrl });
        }
      }
    }

    // Deduplicate locations across all pages
    const locMap = new Map<string, { loc: ExtractedLocation; sourcePageImageUrl: string }>();
    for (const page of job.pages) {
      if (!page.rawData?.locations) continue;
      for (const loc of page.rawData.locations) {
        const key = loc.name.toLowerCase().trim();
        if (!locMap.has(key)) {
          locMap.set(key, { loc, sourcePageImageUrl: page.imageUrl });
        }
      }
    }

    // Save characters and generate reference images
    for (const [, { char, sourcePageImageUrl }] of charMap) {
      const charId = crypto.randomUUID();
      try {
        // Save to Firestore first
        await adminDb.collection("characters").doc(charId).set({
          name: char.name,
          type: char.type || "character",
          role: char.role || "main_character",
          visualDna: char.visualDna || {},
          characterPrompt: char.characterPrompt,
          referenceImageUrl: "",
          sourceImageUrl: sourcePageImageUrl,
          tags: char.tags || [],
          sourceBookId: "",
          sourcePageId: "",
          cloneJobId: jobId,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Generate reference image
        const img = await generateCharacterReference(char.characterPrompt, {
          sourceImageUrl: sourcePageImageUrl || undefined,
          characterName: char.name,
          characterInfo:
            (char.visualDna as Record<string, string[]>)?.distinguishingFeatures?.join(", ") || "",
        });
        const buffer = Buffer.from(img.base64, "base64");
        const key = `assets/characters/${charId}/reference.png`;
        const { url } = await uploadToR2({
          client: r2Client,
          config: r2Config,
          key,
          body: buffer,
          contentType: "image/png",
        });

        await adminDb.collection("characters").doc(charId).update({
          referenceImageUrl: url,
          updatedAt: FieldValue.serverTimestamp(),
        });

        results.push({
          id: charId,
          name: char.name,
          type: "character",
          referenceImageUrl: url,
          status: "success",
        });
      } catch (err) {
        results.push({
          id: charId,
          name: char.name,
          type: "character",
          referenceImageUrl: "",
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Save locations and generate reference images
    for (const [, { loc, sourcePageImageUrl }] of locMap) {
      const locId = crypto.randomUUID();
      try {
        await adminDb.collection("locations").doc(locId).set({
          name: loc.name,
          description: loc.description || "",
          visualDescription: loc.visualDescription || "",
          locationPrompt: loc.locationPrompt,
          atmosphere: loc.atmosphere || {},
          props: loc.props || [],
          referenceImageUrl: "",
          sourceImageUrl: sourcePageImageUrl,
          tags: loc.tags || [],
          sourceBookId: "",
          sourcePageId: "",
          cloneJobId: jobId,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        const img = await generateLocationReference(loc.locationPrompt, {
          sourceImageUrl: sourcePageImageUrl || undefined,
          locationName: loc.name,
        });
        const buffer = Buffer.from(img.base64, "base64");
        const key = `assets/locations/${locId}/reference.png`;
        const { url } = await uploadToR2({
          client: r2Client,
          config: r2Config,
          key,
          body: buffer,
          contentType: "image/png",
        });

        await adminDb.collection("locations").doc(locId).update({
          referenceImageUrl: url,
          updatedAt: FieldValue.serverTimestamp(),
        });

        results.push({
          id: locId,
          name: loc.name,
          type: "location",
          referenceImageUrl: url,
          status: "success",
        });
      } catch (err) {
        results.push({
          id: locId,
          name: loc.name,
          type: "location",
          referenceImageUrl: "",
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Save entity mapping on clone job for step 5
    const entityMap = {
      characters: results
        .filter((r) => r.type === "character" && r.status === "success")
        .map((r) => ({ id: r.id, name: r.name, referenceImageUrl: r.referenceImageUrl })),
      locations: results
        .filter((r) => r.type === "location" && r.status === "success")
        .map((r) => ({ id: r.id, name: r.name, referenceImageUrl: r.referenceImageUrl })),
    };

    await docRef.update({
      entityMap,
      status: "entities_ready",
      updatedAt: now,
    });

    const succeeded = results.filter((r) => r.status === "success").length;
    const failed = results.filter((r) => r.status === "error").length;

    return NextResponse.json({
      success: true,
      total: results.length,
      succeeded,
      failed,
      results,
      entityMap,
    });
  } catch (error) {
    console.error("[clone/extract-entities] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
