import type { PrismaClient } from "@vx/db";
import type { JobContext } from "../job-context";

interface ExtractedChar {
  name: string;
  type?: string;
  role?: string;
  visualDna?: Record<string, unknown>;
  characterPrompt: string;
  tags?: string[];
}

interface ExtractedLoc {
  name: string;
  description?: string;
  visualDescription?: string;
  locationPrompt: string;
  atmosphere?: Record<string, string>;
  props?: string[];
  tags?: string[];
}

interface JobPage {
  imageUrl: string;
  rawData?: { characters?: ExtractedChar[]; locations?: ExtractedLoc[] };
}

export interface ExtractEntitiesDeps {
  generateCharacterReference: (
    prompt: string,
    opts: { sourceImageUrl?: string; characterName: string; characterInfo?: string },
  ) => Promise<{ base64: string }>;
  generateLocationReference: (
    prompt: string,
    opts: { sourceImageUrl?: string; locationName: string },
  ) => Promise<{ base64: string }>;
  uploadToR2: (args: { key: string; body: Buffer; contentType: string }) => Promise<{ url: string }>;
  randomUUID: () => string;
}

export async function stepExtractEntities(
  ctx: JobContext,
  db: PrismaClient,
  deps: ExtractEntitiesDeps,
): Promise<void> {
  const job = await db.cloneJob.findUnique({ where: { id: ctx.jobId } });
  if (!job) throw new Error(`cloneJob ${ctx.jobId} missing`);
  const pages = (job.pages as JobPage[] | null | undefined) ?? [];

  const charsToProcess: Array<{ char: ExtractedChar; sourcePageImageUrl: string }> = [];
  const locsToProcess: Array<{ loc: ExtractedLoc; sourcePageImageUrl: string }> = [];

  for (const page of pages) {
    for (const c of page.rawData?.characters ?? []) {
      charsToProcess.push({ char: c, sourcePageImageUrl: page.imageUrl });
    }
    for (const l of page.rawData?.locations ?? []) {
      locsToProcess.push({ loc: l, sourcePageImageUrl: page.imageUrl });
    }
  }

  const characters: Array<{ id: string; name: string; referenceImageUrl: string }> = [];
  const locations: Array<{ id: string; name: string; referenceImageUrl: string }> = [];

  for (const { char, sourcePageImageUrl } of charsToProcess) {
    const id = deps.randomUUID();
    // sourceImageUrl + cloneJobId are not top-level columns — they live in
    // the `data` Json column for later cleanup and traceability.
    await db.character.create({
      data: {
        id,
        name: char.name,
        type: char.type || "character",
        role: char.role || "main_character",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        visualDna: (char.visualDna ?? {}) as any,
        characterPrompt: char.characterPrompt,
        referenceImageUrl: "",
        tags: char.tags ?? [],
        data: { sourceImageUrl: sourcePageImageUrl, cloneJobId: ctx.jobId },
      },
    });

    const img = await deps.generateCharacterReference(char.characterPrompt, {
      sourceImageUrl: sourcePageImageUrl || undefined,
      characterName: char.name,
      characterInfo:
        (char.visualDna as Record<string, string[]>)?.distinguishingFeatures?.join(", ") || "",
    });
    const buffer = Buffer.from(img.base64, "base64");
    const { url } = await deps.uploadToR2({
      key: `assets/characters/${id}/reference.png`,
      body: buffer,
      contentType: "image/png",
    });
    await db.character.update({
      where: { id },
      data: { referenceImageUrl: url },
    });
    characters.push({ id, name: char.name, referenceImageUrl: url });
  }

  for (const { loc, sourcePageImageUrl } of locsToProcess) {
    const id = deps.randomUUID();
    await db.location.create({
      data: {
        id,
        name: loc.name,
        description: loc.description || "",
        visualDescription: loc.visualDescription || "",
        locationPrompt: loc.locationPrompt,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        atmosphere: (loc.atmosphere ?? {}) as any,
        props: loc.props ?? [],
        referenceImageUrl: "",
        tags: loc.tags ?? [],
        data: { sourceImageUrl: sourcePageImageUrl, cloneJobId: ctx.jobId },
      },
    });
    const img = await deps.generateLocationReference(loc.locationPrompt, {
      sourceImageUrl: sourcePageImageUrl || undefined,
      locationName: loc.name,
    });
    const buffer = Buffer.from(img.base64, "base64");
    const { url } = await deps.uploadToR2({
      key: `assets/locations/${id}/reference.png`,
      body: buffer,
      contentType: "image/png",
    });
    await db.location.update({
      where: { id },
      data: { referenceImageUrl: url },
    });
    locations.push({ id, name: loc.name, referenceImageUrl: url });
  }

  await db.cloneJob.update({
    where: { id: ctx.jobId },
    data: { entityMap: { characters, locations } },
  });
  await ctx.markStepComplete("extract-entities");
}
