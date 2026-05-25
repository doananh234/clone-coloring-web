import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { generateLocationReference } from "@/lib/ai";
import { getR2Config, createR2Client, uploadToR2 } from "@/lib/r2";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const doc = await adminDb.collection("locations").doc(id).get();
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
    const { id: _, createdAt, regenerateReference, redesignPrompt, ...data } = body;

    // Handle reference image regeneration (with optional redesign prompt)
    if (regenerateReference) {
      const doc = await adminDb.collection("locations").doc(id).get();
      if (!doc.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const location = doc.data()!;
      const basePrompt = location.locationPrompt;
      if (!basePrompt)
        return NextResponse.json({ error: "No location prompt to generate from" }, { status: 400 });

      // Append redesign instructions if provided
      const prompt = redesignPrompt
        ? `${basePrompt}\n\nADDITIONAL REDESIGN INSTRUCTIONS: ${redesignPrompt}`
        : basePrompt;

      const img = await generateLocationReference(prompt, {
        sourceImageUrl: location.sourceImageUrl || undefined,
        locationName: location.name,
      });
      const buffer = Buffer.from(img.base64, "base64");
      const r2Config = getR2Config();
      const r2Client = createR2Client(r2Config);
      const key = `assets/locations/${id}/reference.png`;
      const { url } = await uploadToR2({
        client: r2Client,
        config: r2Config,
        key,
        body: buffer,
        contentType: "image/png",
      });
      data.referenceImageUrl = url;
    }

    data.updatedAt = FieldValue.serverTimestamp();
    await adminDb.collection("locations").doc(id).update(data);
    return NextResponse.json({ success: true, referenceImageUrl: data.referenceImageUrl || "" });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await adminDb.collection("locations").doc(id).delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
