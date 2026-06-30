import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { generateCharacterReference, generateLocationReference } from "@vx/server-core/ai";
import { getR2Config, createR2Client, uploadToR2 } from "@vx/server-core/r2";

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
      const allChars = await prisma.character.findMany();
      const missingChars = allChars.filter(
        (c) => !c.referenceImageUrl && c.characterPrompt,
      );

      for (const character of missingChars) {
        try {
          const visualDna = (character.visualDna as any) || {};
          const extra = (character.data as any) || {};
          const img = await generateCharacterReference(character.characterPrompt!, {
            sourceImageUrl: extra.sourceImageUrl || undefined,
            characterName: character.name,
            characterInfo: visualDna.distinguishingFeatures?.join(", ") || "",
          });
          const buffer = Buffer.from(img.base64, "base64");
          const key = `assets/characters/${character.id}/reference.png`;
          const { url } = await uploadToR2({
            client: r2Client,
            config: r2Config,
            key,
            body: buffer,
            contentType: "image/png",
          });
          await prisma.character.update({
            where: { id: character.id },
            data: { referenceImageUrl: url },
          });
          results.push({
            id: character.id,
            name: character.name,
            type: "character",
            success: true,
            referenceImageUrl: url,
          });
        } catch (error) {
          results.push({
            id: character.id,
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
      const allLocs = await prisma.location.findMany();
      const missingLocs = allLocs.filter(
        (l) => !l.referenceImageUrl && l.locationPrompt,
      );

      for (const location of missingLocs) {
        try {
          const extra = (location.data as any) || {};
          const img = await generateLocationReference(location.locationPrompt!, {
            sourceImageUrl: extra.sourceImageUrl || undefined,
            locationName: location.name,
          });
          const buffer = Buffer.from(img.base64, "base64");
          const key = `assets/locations/${location.id}/reference.png`;
          const { url } = await uploadToR2({
            client: r2Client,
            config: r2Config,
            key,
            body: buffer,
            contentType: "image/png",
          });
          await prisma.location.update({
            where: { id: location.id },
            data: { referenceImageUrl: url },
          });
          results.push({
            id: location.id,
            name: location.name,
            type: "location",
            success: true,
            referenceImageUrl: url,
          });
        } catch (error) {
          results.push({
            id: location.id,
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
