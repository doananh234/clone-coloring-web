import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { adminStorage } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { generateCategoryIcon } from "@/lib/ai";

async function uploadToStorage(base64Data: string, categoryId: string): Promise<string> {
  const bucket = adminStorage.bucket();
  const filename = `category-icons/${categoryId}/icon-${Date.now()}.png`;
  const buffer = Buffer.from(base64Data, "base64");

  const file = bucket.file(filename);
  await file.save(buffer, {
    metadata: { contentType: "image/png" },
    public: true,
  });

  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
  return publicUrl;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, categoryId, action, previewBase64 } = body as {
      prompt: string;
      categoryId?: string;
      action: "generate" | "upload";
      previewBase64?: string;
    };

    if (action === "generate") {
      if (!prompt) {
        return NextResponse.json({ error: "prompt required" }, { status: 400 });
      }
      const img = await generateCategoryIcon(prompt);
      return NextResponse.json({ success: true, previewUrl: img.dataUrl, base64: img.base64 });
    }

    if (action === "upload") {
      if (!categoryId) {
        return NextResponse.json({ error: "categoryId required" }, { status: 400 });
      }
      if (!previewBase64) {
        return NextResponse.json({ error: "previewBase64 required" }, { status: 400 });
      }

      const imageUrl = await uploadToStorage(previewBase64, categoryId);

      await adminDb.collection("categories").doc(categoryId).update({
        iconUrl: imageUrl,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true, imageUrl });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
