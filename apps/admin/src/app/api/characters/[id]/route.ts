import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { generateCharacterReference } from "@vx/server-core/ai";
import { getR2Config, createR2Client, uploadToR2 } from "@vx/server-core/r2";
import { flushLangfuse } from "@vx/server-core/langfuse";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const character = await prisma.character.findUnique({ where: { id } });
    if (!character) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(character);
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
      const character = await prisma.character.findUnique({ where: { id } });
      if (!character) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const basePrompt = character.characterPrompt;
      if (!basePrompt)
        return NextResponse.json(
          { error: "No character prompt to generate from" },
          { status: 400 },
        );

      // Append redesign instructions if provided
      const prompt = redesignPrompt
        ? `${basePrompt}\n\nADDITIONAL REDESIGN INSTRUCTIONS: ${redesignPrompt}`
        : basePrompt;

      const visualDna = (character.visualDna as any) || {};
      const extra = (character.data as any) || {};
      const img = await generateCharacterReference(prompt, {
        sourceImageUrl: extra.sourceImageUrl || undefined,
        characterName: character.name,
        characterInfo: visualDna.distinguishingFeatures?.join(", ") || "",
        trace: { caller: "characters/regenerate", entityType: "character", entityId: id },
      });
      const buffer = Buffer.from(img.base64, "base64");
      const r2Config = getR2Config();
      const r2Client = createR2Client(r2Config);
      const key = `assets/characters/${id}/reference.png`;
      const { url } = await uploadToR2({
        client: r2Client,
        config: r2Config,
        key,
        body: buffer,
        contentType: "image/png",
      });
      data.referenceImageUrl = `${url}?v=${Date.now()}`;
    }

    await prisma.character.update({ where: { id }, data });

    await flushLangfuse();

    return NextResponse.json({ success: true, referenceImageUrl: data.referenceImageUrl || "" });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.character.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
