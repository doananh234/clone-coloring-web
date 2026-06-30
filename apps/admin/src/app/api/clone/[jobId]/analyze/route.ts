import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { visionAnalyzeJSON } from "@vx/server-core/ai/llm-provider";
import { CLONE_EXTRACTION_PROMPT, buildReproductionPrompt } from "@vx/server-core/ai/prompts";
import { flushLangfuse } from "@vx/server-core/langfuse";
import type { CloneJobPage, ClonePageRawData } from "@vx/server-core/ai/clone-types";

type RouteParams = { params: Promise<{ jobId: string }> };

export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;
    const row = await prisma.cloneJob.findUnique({ where: { id: jobId } });

    if (!row) {
      return NextResponse.json({ error: "Clone job not found" }, { status: 404 });
    }

    // Allow retry from extracted, analyzed, analyzing (stale), or error states
    const allowedStatuses = ["extracted", "analyzed", "analyzing", "error"];
    if (!allowedStatuses.includes(row.status)) {
      return NextResponse.json(
        { error: `Cannot analyze job in status: ${row.status}` },
        { status: 400 },
      );
    }

    // Set job status to analyzing
    await prisma.cloneJob.update({ where: { id: jobId }, data: { status: "analyzing" } });

    let analyzedCount = 0;
    const updatedPages: CloneJobPage[] = [...((row.pages as CloneJobPage[]) || [])];

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
        await prisma.cloneJob.update({
          where: { id: jobId },
          data: { pages: updatedPages as any },
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
        await prisma.cloneJob.update({
          where: { id: jobId },
          data: { pages: updatedPages as any, analyzedPages: analyzedCount },
        });
      } catch (pageError) {
        console.error(`[clone/analyze] Page ${page.pageNumber} failed:`, pageError);
        updatedPages[i] = {
          ...page,
          status: "error",
          error: pageError instanceof Error ? pageError.message : String(pageError),
        };
        await prisma.cloneJob.update({
          where: { id: jobId },
          data: { pages: updatedPages as any },
        });
      }
    }

    // Final status — only "analyzed" if every page succeeded
    const finalStatus = updatedPages.every((p) => p.status === "analyzed") ? "analyzed" : "error";

    const final = await prisma.cloneJob.update({
      where: { id: jobId },
      data: { status: finalStatus, analyzedPages: analyzedCount },
    });

    await flushLangfuse();

    return NextResponse.json({ success: true, job: final });
  } catch (error) {
    console.error("[clone/analyze] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
