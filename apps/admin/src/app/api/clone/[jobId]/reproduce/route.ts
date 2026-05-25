import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { generateColoringPage } from "@/lib/ai";
import { getR2Config, createR2Client, uploadToR2 } from "@/lib/r2";
import type { CloneJob } from "@/lib/ai/clone-types";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ jobId: string }> };

type EntityRef = { id: string; name: string; referenceImageUrl: string };
type EntityMap = { characters: EntityRef[]; locations: EntityRef[] };

/**
 * Reproduce a single page: generate coloring page using prompt + character/location refs.
 */
async function reproducePage(
  prompt: string,
  charRefs: string[],
  locRefs: string[],
  bookId: string,
  pageId: string,
  r2Client: ReturnType<typeof createR2Client>,
  r2Config: ReturnType<typeof getR2Config>,
) {
  const img = await generateColoringPage(prompt, {
    characterReferenceImageUrls: charRefs.length > 0 ? charRefs : undefined,
    locationReferenceImageUrls: locRefs.length > 0 ? locRefs : undefined,
  });

  const buffer = Buffer.from(img.base64, "base64");
  const key = `assets/${bookId}/pages/${pageId}.png`;
  const { url } = await uploadToR2({
    client: r2Client,
    config: r2Config,
    key,
    body: buffer,
    contentType: "image/png",
  });

  return url;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;
    const body = await req.json().catch(() => ({}));
    const { pageIndex } = body as { pageIndex?: number };

    const docRef = adminDb.collection("cloneJobs").doc(jobId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Clone job not found" }, { status: 404 });
    }

    const job = doc.data() as CloneJob & { entityMap?: EntityMap; bookId?: string };
    const entityMap: EntityMap = job.entityMap || { characters: [], locations: [] };

    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);
    const now = new Date().toISOString();

    // Create or reuse book
    let bookId = job.bookId || "";
    if (!bookId) {
      bookId = crypto.randomUUID();

      // Build initial coloringPages with prompts but no generated URLs yet
      const coloringPages = job.pages
        .filter((p) => p.imageUrl)
        .map((p) => {
          const charNames = (p.rawData?.characters || []).map((c) => c.name.toLowerCase().trim());
          const locNames = (p.rawData?.locations || []).map((l) => l.name.toLowerCase().trim());

          return {
            id: crypto.randomUUID(),
            url: "", // will be filled per page
            isPublic: false,
            prompt: p.rawData?.reproductionPrompt || "",
            characterReferenceImageUrls: entityMap.characters
              .filter((e) => charNames.includes(e.name.toLowerCase().trim()))
              .map((e) => e.referenceImageUrl),
            locationReferenceImageUrls: entityMap.locations
              .filter((e) => locNames.includes(e.name.toLowerCase().trim()))
              .map((e) => e.referenceImageUrl),
            sceneData: p.rawData
              ? {
                  scene: p.rawData.scene,
                  environment: p.rawData.environment,
                  characters: (p.rawData.characters || []).map((c) => ({
                    name: c.name,
                    type: c.type,
                    role: c.role,
                    characterPrompt: c.characterPrompt,
                  })),
                  locations: (p.rawData.locations || []).map((l) => ({
                    name: l.name,
                    description: l.description,
                    locationPrompt: l.locationPrompt,
                  })),
                }
              : undefined,
            status: "pending" as const,
          };
        });

      const storyOutline = job.pages
        .filter((p) => p.rawData)
        .map((p, i) => ({
          pageNumber: i + 1,
          scene: p.rawData!.scene?.description || "",
          characters: (p.rawData!.characters || []).map((c) => c.name),
          locations: (p.rawData!.locations || []).map((l) => l.name),
          mood: p.rawData!.environment?.mood || "",
        }));

      await adminDb
        .collection("books")
        .doc(bookId)
        .set({
          title: job.bookData?.title || job.name || "Untitled",
          subtitle: job.bookData?.subtitle || "",
          description: job.bookData?.description || "",
          status: "reproducing",
          coloringPages,
          summaryPages: [],
          specifications: { pages: coloringPages.length },
          storyOutline,
          entityMap,
          isPublic: false,
          isPremium: false,
          isConverted: false,
          isRedesigned: false,
          isEditionConverted: false,
          cloneJobId: jobId,
          createdAt: now,
          updatedAt: now,
        });

      await docRef.update({ bookId, updatedAt: now });
    }

    // Read current book state
    const bookRef = adminDb.collection("books").doc(bookId);
    const bookDoc = await bookRef.get();
    if (!bookDoc.exists) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const bookData = bookDoc.data()!;
    const coloringPages = bookData.coloringPages || [];

    // Determine which pages to generate
    const pagesToGenerate =
      pageIndex !== undefined
        ? [pageIndex]
        : coloringPages
            .map((_: unknown, i: number) => i)
            .filter((i: number) => !coloringPages[i].url || coloringPages[i].status === "pending");

    const results: { index: number; success: boolean; url?: string; error?: string }[] = [];

    for (const idx of pagesToGenerate) {
      const page = coloringPages[idx];
      if (!page || !page.prompt) {
        results.push({ index: idx, success: false, error: "No prompt for this page" });
        continue;
      }

      try {
        // Update status to generating
        coloringPages[idx].status = "generating";
        await bookRef.update({ coloringPages, updatedAt: now });

        const url = await reproducePage(
          page.prompt,
          page.characterReferenceImageUrls || [],
          page.locationReferenceImageUrls || [],
          bookId,
          page.id,
          r2Client,
          r2Config,
        );

        coloringPages[idx].url = url;
        coloringPages[idx].status = "done";
        await bookRef.update({ coloringPages, updatedAt: now });

        results.push({ index: idx, success: true, url });
      } catch (err) {
        coloringPages[idx].status = "error";
        await bookRef.update({ coloringPages, updatedAt: now });
        results.push({
          index: idx,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Check if all pages are done
    const allDone = coloringPages.every(
      (p: { status: string }) => p.status === "done" || p.status === "error",
    );
    if (allDone) {
      await bookRef.update({ status: "draft", updatedAt: now });
      await docRef.update({ status: "reproduced", updatedAt: now });
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({
      success: true,
      bookId,
      total: results.length,
      succeeded,
      failed,
      allDone,
      results,
    });
  } catch (error) {
    console.error("[clone/reproduce] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
