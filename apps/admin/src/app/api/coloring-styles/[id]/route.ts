import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { getR2Config, createR2Client, uploadToR2 } from "@/lib/r2";
import { buildColorizationDirective } from "@/lib/ai/prompts";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const doc = await adminDb.collection("coloringStyles").doc(id).get();
    if (!doc.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ id: doc.id, ...doc.data() });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const { id: _, createdAt: __, regenerateDirective, newReferenceImageUrls, ...data } = body;

    // Regenerate directive from style properties if requested
    if (regenerateDirective) {
      const doc = await adminDb.collection("coloringStyles").doc(id).get();
      if (!doc.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const style = doc.data()!;
      const merged = { ...style, ...data };
      data.colorizationDirective = buildColorizationDirective(merged);
    }

    // Upload new reference images if provided
    if (newReferenceImageUrls && Array.isArray(newReferenceImageUrls)) {
      const r2Config = getR2Config();
      const r2Client = createR2Client(r2Config);
      const labels = ["primary", "detail", "full-page"];
      const referenceImages: { url: string; label: string }[] = [];
      const urls = newReferenceImageUrls.slice(0, 3);

      for (let i = 0; i < urls.length; i++) {
        const imgUrl = urls[i];
        let buffer: Buffer;

        if (imgUrl.startsWith("data:")) {
          const base64 = imgUrl.split(",")[1];
          buffer = Buffer.from(base64, "base64");
        } else {
          const res = await fetch(imgUrl);
          const arrayBuf = await res.arrayBuffer();
          buffer = Buffer.from(arrayBuf);
        }

        const key = `assets/coloring-styles/${id}/ref-${i}.png`;
        const { url } = await uploadToR2({
          client: r2Client,
          config: r2Config,
          key,
          body: buffer,
          contentType: "image/png",
        });

        referenceImages.push({ url, label: labels[i] || `ref-${i}` });
      }

      data.referenceImages = referenceImages;
      data.thumbnailUrl = referenceImages[0]?.url || "";
    }

    data.updatedAt = FieldValue.serverTimestamp();
    await adminDb.collection("coloringStyles").doc(id).update(data);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await adminDb.collection("coloringStyles").doc(id).delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
