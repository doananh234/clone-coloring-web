import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { generateLocationReference } from "@/lib/ai";
import { getR2Config, createR2Client, uploadToR2 } from "@/lib/r2";

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
      description,
      visualDescription,
      locationPrompt,
      atmosphere,
      props,
      tags,
      sourceBookId,
      sourcePageId,
      sourceImageUrl,
      generateReference,
    } = body;

    if (!name || !locationPrompt) {
      return NextResponse.json({ error: "name and locationPrompt required" }, { status: 400 });
    }

    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);

    // Create Firestore doc first to get the ID for R2 keys
    const docRef = await adminDb.collection("locations").add({
      name,
      description: description || "",
      visualDescription: visualDescription || "",
      locationPrompt,
      referenceImageUrl: "",
      sourceImageUrl: "",
      atmosphere: atmosphere || {},
      props: props || [],
      tags: tags || [],
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
          const key = `assets/locations/${docRef.id}/source.${ext}`;
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
        const img = await generateLocationReference(locationPrompt, {
          sourceImageUrl: sourceImageUrl || undefined,
          locationName: name,
        });
        const buffer = Buffer.from(img.base64, "base64");
        const key = `assets/locations/${docRef.id}/reference.png`;
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
      await adminDb.collection("locations").doc(docRef.id).update(updates);
    }

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
