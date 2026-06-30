import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { generateCharacterReference, generateLocationReference } from "@vx/server-core/ai";
import { getR2Config, createR2Client, uploadToR2 } from "@vx/server-core/r2";
import { flushLangfuse } from "@vx/server-core/langfuse";
import type {
  CloneJobPage,
  ExtractedCharacter,
  ExtractedLocation,
} from "@vx/server-core/ai/clone-types";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ jobId: string }> };

type SavedEntity = {
  id: string;
  name: string;
  type: "character" | "location";
  referenceImageUrl: string;
  status: "success" | "error";
  error?: string;
};

type SelectedChar = { char: ExtractedCharacter; sourcePageImageUrl: string };
type SelectedLoc = { loc: ExtractedLocation; sourcePageImageUrl: string };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;
    const body = await req.json().catch(() => ({}));
    const { characters: selectedChars, locations: selectedLocs } = body as {
      characters?: SelectedChar[];
      locations?: SelectedLoc[];
    };

    const row = await prisma.cloneJob.findUnique({ where: { id: jobId } });

    if (!row) {
      return NextResponse.json({ error: "Clone job not found" }, { status: 404 });
    }

    const pages = (row.pages as CloneJobPage[]) || [];
    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);
    const results: SavedEntity[] = [];

    // Use client-selected characters, or fallback to all from job
    const charsToProcess: SelectedChar[] = selectedChars && selectedChars.length > 0
      ? selectedChars
      : (() => {
          const items: SelectedChar[] = [];
          for (const page of pages) {
            if (!page.rawData?.characters) continue;
            for (const char of page.rawData.characters) {
              items.push({ char, sourcePageImageUrl: page.imageUrl });
            }
          }
          return items;
        })();

    // Use client-selected locations, or fallback to all from job
    const locsToProcess: SelectedLoc[] = selectedLocs && selectedLocs.length > 0
      ? selectedLocs
      : (() => {
          const items: SelectedLoc[] = [];
          for (const page of pages) {
            if (!page.rawData?.locations) continue;
            for (const loc of page.rawData.locations) {
              items.push({ loc, sourcePageImageUrl: page.imageUrl });
            }
          }
          return items;
        })();

    // Save characters and generate reference images
    for (const { char, sourcePageImageUrl } of charsToProcess) {
      let charId = "";
      try {
        // Save to Postgres first
        const created = await prisma.character.create({
          data: {
            name: char.name,
            type: char.type || "character",
            role: char.role || "main_character",
            visualDna: (char.visualDna || {}) as any,
            characterPrompt: char.characterPrompt,
            referenceImageUrl: "",
            tags: char.tags || [],
            sourceBookId: null,
            data: {
              sourceImageUrl: sourcePageImageUrl,
              sourcePageId: "",
              cloneJobId: jobId,
            },
          },
        });
        charId = created.id;

        // Generate reference image
        const img = await generateCharacterReference(char.characterPrompt, {
          sourceImageUrl: sourcePageImageUrl || undefined,
          characterName: char.name,
          characterInfo:
            (char.visualDna as Record<string, string[]>)?.distinguishingFeatures?.join(", ") || "",
          trace: { caller: "clone/extract-entities", entityType: "character", entityId: charId },
        });
        const buffer = Buffer.from(img.base64, "base64");
        const key = `assets/characters/${charId}/reference.png`;
        const { url } = await uploadToR2({
          client: r2Client,
          config: r2Config,
          key,
          body: buffer,
          contentType: "image/png",
        });

        await prisma.character.update({
          where: { id: charId },
          data: { referenceImageUrl: url },
        });

        results.push({
          id: charId,
          name: char.name,
          type: "character",
          referenceImageUrl: url,
          status: "success",
        });
      } catch (err) {
        results.push({
          id: charId,
          name: char.name,
          type: "character",
          referenceImageUrl: "",
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Save locations and generate reference images
    for (const { loc, sourcePageImageUrl } of locsToProcess) {
      let locId = "";
      try {
        const created = await prisma.location.create({
          data: {
            name: loc.name,
            description: loc.description || "",
            visualDescription: loc.visualDescription || "",
            locationPrompt: loc.locationPrompt,
            atmosphere: loc.atmosphere || {},
            props: loc.props || [],
            referenceImageUrl: "",
            tags: loc.tags || [],
            sourceBookId: null,
            data: {
              sourceImageUrl: sourcePageImageUrl,
              sourcePageId: "",
              cloneJobId: jobId,
            },
          },
        });
        locId = created.id;

        const img = await generateLocationReference(loc.locationPrompt, {
          sourceImageUrl: sourcePageImageUrl || undefined,
          locationName: loc.name,
          trace: { caller: "clone/extract-entities", entityType: "location", entityId: locId },
        });
        const buffer = Buffer.from(img.base64, "base64");
        const key = `assets/locations/${locId}/reference.png`;
        const { url } = await uploadToR2({
          client: r2Client,
          config: r2Config,
          key,
          body: buffer,
          contentType: "image/png",
        });

        await prisma.location.update({
          where: { id: locId },
          data: { referenceImageUrl: url },
        });

        results.push({
          id: locId,
          name: loc.name,
          type: "location",
          referenceImageUrl: url,
          status: "success",
        });
      } catch (err) {
        results.push({
          id: locId,
          name: loc.name,
          type: "location",
          referenceImageUrl: "",
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Save entity mapping on clone job for step 5
    const entityMap = {
      characters: results
        .filter((r) => r.type === "character" && r.status === "success")
        .map((r) => ({ id: r.id, name: r.name, referenceImageUrl: r.referenceImageUrl })),
      locations: results
        .filter((r) => r.type === "location" && r.status === "success")
        .map((r) => ({ id: r.id, name: r.name, referenceImageUrl: r.referenceImageUrl })),
    };

    await prisma.cloneJob.update({
      where: { id: jobId },
      data: {
        entityMap: entityMap as any,
        status: "entities_ready",
      },
    });

    const succeeded = results.filter((r) => r.status === "success").length;
    const failed = results.filter((r) => r.status === "error").length;

    await flushLangfuse();
    return NextResponse.json({
      success: true,
      total: results.length,
      succeeded,
      failed,
      results,
      entityMap,
    });
  } catch (error) {
    console.error("[clone/extract-entities] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
