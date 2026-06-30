import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { generateLocationReference } from "@vx/server-core/ai";
import { getR2Config, createR2Client, uploadToR2 } from "@vx/server-core/r2";
import { flushLangfuse } from "@vx/server-core/langfuse";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const location = await prisma.location.findUnique({ where: { id } });
    if (!location) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(location);
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
      const location = await prisma.location.findUnique({ where: { id } });
      if (!location) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const basePrompt = location.locationPrompt;
      if (!basePrompt)
        return NextResponse.json({ error: "No location prompt to generate from" }, { status: 400 });

      // Append redesign instructions if provided
      const prompt = redesignPrompt
        ? `${basePrompt}\n\nADDITIONAL REDESIGN INSTRUCTIONS: ${redesignPrompt}`
        : basePrompt;

      const extra = (location.data as any) || {};
      const img = await generateLocationReference(prompt, {
        sourceImageUrl: extra.sourceImageUrl || undefined,
        locationName: location.name,
        trace: { caller: "locations/regenerate", entityType: "location", entityId: id },
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
      data.referenceImageUrl = `${url}?v=${Date.now()}`;
    }

    await prisma.location.update({ where: { id }, data });

    await flushLangfuse();

    return NextResponse.json({ success: true, referenceImageUrl: data.referenceImageUrl || "" });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.location.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
