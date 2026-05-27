import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { visionAnalyzeJSON } from "@/lib/ai/llm-provider";
import { CLONE_EXTRACTION_PROMPT, buildReproductionPrompt } from "@/lib/ai/prompts";
import { flushLangfuse } from "@/lib/langfuse";
import type { CloneJob, ClonePageRawData } from "@/lib/ai/clone-types";

type RouteParams = { params: Promise<{ jobId: string }> };

export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;
    const docRef = adminDb.collection("cloneJobs").doc(jobId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Clone job not found" }, { status: 404 });
    }

    const job = doc.data() as CloneJob;

    // Allow retry from extracted, analyzed, analyzing (stale), or error states
    const allowedStatuses = ["extracted", "analyzed", "analyzing", "error"];
    if (!allowedStatuses.includes(job.status)) {
      return NextResponse.json(
        { error: `Cannot analyze job in status: ${job.status}` },
        { status: 400 },
      );
    }

    // Set job status to analyzing
    await docRef.update({ status: "analyzing", updatedAt: new Date().toISOString() });

    let analyzedCount = 0;
    const updatedPages = [...job.pages];

    for (let i = 0; i < updatedPages.length; i++) {
      const page = updatedPages[i];

      // Skip already analyzed pages
      if (page.status === "analyzed" && page.rawData) {
        analyzedCount++;
        continue;
      }

      try {
        // Update page status to analyzing
        updatedPages[i] = { ...page, status: "analyzing" };
        await docRef.update({
          pages: updatedPages,
          updatedAt: new Date().toISOString(),
        });

        // Call vision AI — URL resolved centrally by visionAnalyzeJSON
        const extracted = await visionAnalyzeJSON<Omit<ClonePageRawData, "reproductionPrompt">>(
          page.imageUrl,
          CLONE_EXTRACTION_PROMPT,
          { maxTokens: 4000, temperature: 0.3, trace: { caller: "clone/analyze", entityType: "cloneJob", entityId: jobId } },
        );

        // Build reproduction prompt from structured data
        const reproductionPrompt = buildReproductionPrompt(extracted);

        const rawData: ClonePageRawData = {
          scene: extracted.scene || {
            description: "",
            cameraView: "wide",
            composition: "",
          },
          environment: extracted.environment || {
            timeOfDay: "day",
            weather: "sunny",
            season: "neutral",
            mood: "peaceful",
          },
          characters: extracted.characters || [],
          locations: extracted.locations || [],
          props: extracted.props || [],
          reproductionPrompt,
        };

        analyzedCount++;
        updatedPages[i] = { ...page, status: "analyzed", rawData };

        // Progressive update so clients can poll for progress
        await docRef.update({
          pages: updatedPages,
          analyzedPages: analyzedCount,
          updatedAt: new Date().toISOString(),
        });
      } catch (pageError) {
        console.error(`[clone/analyze] Page ${page.pageNumber} failed:`, pageError);
        updatedPages[i] = {
          ...page,
          status: "error",
          error: pageError instanceof Error ? pageError.message : String(pageError),
        };
        await docRef.update({
          pages: updatedPages,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    // Final status — only "analyzed" if every page succeeded
    const finalStatus = updatedPages.every((p) => p.status === "analyzed") ? "analyzed" : "error";

    await docRef.update({
      status: finalStatus,
      analyzedPages: analyzedCount,
      updatedAt: new Date().toISOString(),
    });

    // Re-read final state
    const finalDoc = await docRef.get();

    await flushLangfuse();

    return NextResponse.json({ success: true, job: finalDoc.data() });
  } catch (error) {
    console.error("[clone/analyze] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
