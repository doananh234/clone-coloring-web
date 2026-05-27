import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { generateCharacterReference } from "@/lib/ai";
import { getR2Config, createR2Client, uploadToR2 } from "@/lib/r2";
import { flushLangfuse } from "@/lib/langfuse";

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function guessExtension(url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  if (ext && ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return ext;
  return "jpg";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      type,
      role,
      visualDna,
      characterPrompt,
      tags,
      category,
      sourceBookId,
      sourcePageId,
      sourceImageUrl,
      generateReference,
    } = body;

    if (!name || !characterPrompt) {
      return NextResponse.json({ error: "name and characterPrompt required" }, { status: 400 });
    }

    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);

    // Create Firestore doc first to get the ID for R2 keys
    const docRef = await adminDb.collection("characters").add({
      name,
      type: type || "character",
      role: role || "main_character",
      visualDna: visualDna || {},
      characterPrompt,
      referenceImageUrl: "",
      sourceImageUrl: "",
      tags: tags || [],
      category: category || "",
      sourceBookId: sourceBookId || "",
      sourcePageId: sourcePageId || "",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const updates: Record<string, unknown> = {};

    // Upload source image to R2
    if (sourceImageUrl) {
      try {
        const buffer = await downloadImage(sourceImageUrl);
        if (buffer) {
          const ext = guessExtension(sourceImageUrl);
          const key = `assets/characters/${docRef.id}/source.${ext}`;
          const { url } = await uploadToR2({
            client: r2Client,
            config: r2Config,
            key,
            body: buffer,
          });
          updates.sourceImageUrl = url;
        }
      } catch {
        /* source image upload is best-effort */
      }
    }

    // Generate reference image via image-to-image extraction (or text-only fallback)
    if (generateReference !== false) {
      try {
        const img = await generateCharacterReference(characterPrompt, {
          sourceImageUrl: sourceImageUrl || undefined,
          characterName: name,
          characterInfo: visualDna?.distinguishingFeatures?.join(", ") || "",
          trace: { caller: "extract/save-character", entityType: "character" },
        });
        const buffer = Buffer.from(img.base64, "base64");
        const key = `assets/characters/${docRef.id}/reference.png`;
        const { url } = await uploadToR2({
          client: r2Client,
          config: r2Config,
          key,
          body: buffer,
          contentType: "image/png",
        });
        updates.referenceImageUrl = url;
      } catch {
        /* reference image generation is best-effort */
      }
    }

    // Batch update Firestore with R2 URLs
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = FieldValue.serverTimestamp();
      await adminDb.collection("characters").doc(docRef.id).update(updates);
    }

    await flushLangfuse();

    return NextResponse.json({
      success: true,
      id: docRef.id,
      referenceImageUrl: updates.referenceImageUrl || "",
      sourceImageUrl: updates.sourceImageUrl || "",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
