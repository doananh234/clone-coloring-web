import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
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
  db: Firestore,
  deps: ExtractEntitiesDeps,
): Promise<void> {
  const ref = db.collection("cloneJobs").doc(ctx.jobId);
  const snap = await ref.get();
  const job = snap.data() as { pages: JobPage[] };

  const charsToProcess: Array<{ char: ExtractedChar; sourcePageImageUrl: string }> = [];
  const locsToProcess: Array<{ loc: ExtractedLoc; sourcePageImageUrl: string }> = [];

  for (const page of job.pages) {
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
    await db.collection("characters").doc(id).set({
      name: char.name,
      type: char.type || "character",
      role: char.role || "main_character",
      visualDna: char.visualDna || {},
      characterPrompt: char.characterPrompt,
      referenceImageUrl: "",
      sourceImageUrl: sourcePageImageUrl,
      tags: char.tags || [],
      cloneJobId: ctx.jobId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
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
    await db.collection("characters").doc(id).update({
      referenceImageUrl: url,
      updatedAt: FieldValue.serverTimestamp(),
    });
    characters.push({ id, name: char.name, referenceImageUrl: url });
  }

  for (const { loc, sourcePageImageUrl } of locsToProcess) {
    const id = deps.randomUUID();
    await db.collection("locations").doc(id).set({
      name: loc.name,
      description: loc.description || "",
      visualDescription: loc.visualDescription || "",
      locationPrompt: loc.locationPrompt,
      atmosphere: loc.atmosphere || {},
      props: loc.props || [],
      referenceImageUrl: "",
      sourceImageUrl: sourcePageImageUrl,
      tags: loc.tags || [],
      cloneJobId: ctx.jobId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
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
    await db.collection("locations").doc(id).update({
      referenceImageUrl: url,
      updatedAt: FieldValue.serverTimestamp(),
    });
    locations.push({ id, name: loc.name, referenceImageUrl: url });
  }

  await ref.update({
    entityMap: { characters, locations },
    updatedAt: new Date().toISOString(),
  });
  await ctx.markStepComplete("extract-entities");
}
