import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { generateCharacterReference } from "@vx/server-core/ai";
import { getR2Config, createR2Client, uploadToR2 } from "@vx/server-core/r2";
import { flushLangfuse } from "@vx/server-core/langfuse";

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

    // Create row first to get the ID for R2 keys
    const created = await prisma.character.create({
      data: {
        name,
        type: type || "character",
        role: role || "main_character",
        visualDna: visualDna || {},
        characterPrompt,
        referenceImageUrl: "",
        tags: tags || [],
        sourceBookId: sourceBookId || null,
        data: {
          category: category || "",
          sourcePageId: sourcePageId || "",
          sourceImageUrl: "",
        },
      },
    });

    const updates: Record<string, unknown> = {};
    const extraUpdates: Record<string, unknown> = {};

    // Upload source image to R2
    if (sourceImageUrl) {
      try {
        const buffer = await downloadImage(sourceImageUrl);
        if (buffer) {
          const ext = guessExtension(sourceImageUrl);
          const key = `assets/characters/${created.id}/source.${ext}`;
          const { url } = await uploadToR2({
            client: r2Client,
            config: r2Config,
            key,
            body: buffer,
          });
          extraUpdates.sourceImageUrl = url;
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
        const key = `assets/characters/${created.id}/reference.png`;
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

    // Batch update with R2 URLs
    if (Object.keys(updates).length > 0 || Object.keys(extraUpdates).length > 0) {
      const existingExtra = (created.data as any) || {};
      await prisma.character.update({
        where: { id: created.id },
        data: {
          ...updates,
          data: { ...existingExtra, ...extraUpdates },
        },
      });
    }

    await flushLangfuse();

    return NextResponse.json({
      success: true,
      id: created.id,
      referenceImageUrl: updates.referenceImageUrl || "",
      sourceImageUrl: extraUpdates.sourceImageUrl || "",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
