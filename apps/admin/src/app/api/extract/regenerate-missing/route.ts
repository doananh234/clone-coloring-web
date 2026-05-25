import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { generateCharacterReference, generateLocationReference } from "@/lib/ai";
import { getR2Config, createR2Client, uploadToR2 } from "@/lib/r2";

interface RegenerateResult {
  id: string;
  name: string;
  type: "character" | "location";
  success: boolean;
  referenceImageUrl?: string;
  error?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const entityType: "all" | "characters" | "locations" = body.entityType || "all";

    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);
    const results: RegenerateResult[] = [];

    // Collect characters missing reference images
    if (entityType === "all" || entityType === "characters") {
      const charSnap = await adminDb.collection("characters").get();
      const missingChars = charSnap.docs.filter((doc) => {
        const data = doc.data();
        return !data.referenceImageUrl && data.characterPrompt;
      });

      for (const doc of missingChars) {
        const character = doc.data();
        try {
          const img = await generateCharacterReference(character.characterPrompt, {
            sourceImageUrl: character.sourceImageUrl || undefined,
            characterName: character.name,
            characterInfo: character.visualDna?.distinguishingFeatures?.join(", ") || "",
          });
          const buffer = Buffer.from(img.base64, "base64");
          const key = `assets/characters/${doc.id}/reference-${Date.now()}.png`;
          const { url } = await uploadToR2({
            client: r2Client,
            config: r2Config,
            key,
            body: buffer,
            contentType: "image/png",
          });
          await adminDb.collection("characters").doc(doc.id).update({
            referenceImageUrl: url,
            updatedAt: FieldValue.serverTimestamp(),
          });
          results.push({
            id: doc.id,
            name: character.name,
            type: "character",
            success: true,
            referenceImageUrl: url,
          });
        } catch (error) {
          results.push({
            id: doc.id,
            name: character.name,
            type: "character",
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // Collect locations missing reference images
    if (entityType === "all" || entityType === "locations") {
      const locSnap = await adminDb.collection("locations").get();
      const missingLocs = locSnap.docs.filter((doc) => {
        const data = doc.data();
        return !data.referenceImageUrl && data.locationPrompt;
      });

      for (const doc of missingLocs) {
        const location = doc.data();
        try {
          const img = await generateLocationReference(location.locationPrompt, {
            sourceImageUrl: location.sourceImageUrl || undefined,
            locationName: location.name,
          });
          const buffer = Buffer.from(img.base64, "base64");
          const key = `assets/locations/${doc.id}/reference-${Date.now()}.png`;
          const { url } = await uploadToR2({
            client: r2Client,
            config: r2Config,
            key,
            body: buffer,
            contentType: "image/png",
          });
          await adminDb.collection("locations").doc(doc.id).update({
            referenceImageUrl: url,
            updatedAt: FieldValue.serverTimestamp(),
          });
          results.push({
            id: doc.id,
            name: location.name,
            type: "location",
            success: true,
            referenceImageUrl: url,
          });
        } catch (error) {
          results.push({
            id: doc.id,
            name: location.name,
            type: "location",
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({
      success: true,
      total: results.length,
      succeeded,
      failed,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
