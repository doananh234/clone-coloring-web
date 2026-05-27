import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { editImage } from "@/lib/ai";
import { buildRedesignStrengthPrefix } from "@/lib/ai/prompts";
import { getR2Config, createR2Client, uploadToR2, resolveR2Url } from "@/lib/r2";
import { flushLangfuse } from "@/lib/langfuse";
import type { CloneJob } from "@/lib/ai/clone-types";

export const maxDuration = 120;

type RouteParams = { params: Promise<{ jobId: string }> };

/**
 * Redesign a single page: use original image + prompt (with optional edits)
 * to generate a new version via image-to-image editing.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;
    const body = await req.json();
    const { pageIndex, prompt, changePercent } = body as {
      pageIndex: number;
      prompt?: string;
      changePercent?: number; // 10, 20, or 50
    };

    if (pageIndex === undefined || pageIndex === null) {
      return NextResponse.json({ error: "pageIndex required" }, { status: 400 });
    }

    const docRef = adminDb.collection("cloneJobs").doc(jobId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Clone job not found" }, { status: 404 });
    }

    const job = doc.data() as CloneJob;
    const page = job.pages[pageIndex];

    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    // Use the reproduction prompt from analysis, allow override
    const basePrompt = prompt || page.rawData?.reproductionPrompt || "";
    if (!basePrompt) {
      return NextResponse.json({ error: "No prompt available for this page" }, { status: 400 });
    }

    // Prepend strength guidance based on changePercent
    const pct = changePercent || 30;
    const strengthPrefix = buildRedesignStrengthPrefix(pct);

    const fullPrompt = `${strengthPrefix}\n\n${basePrompt}`;

    // Resolve the original page image URL
    const originalImageUrl = resolveR2Url(page.imageUrl);

    // Image-to-image: use original as base + prompt with strength guidance
    const img = await editImage(originalImageUrl, fullPrompt, {
      trace: { caller: "clone/redesign-page", entityType: "cloneJob", entityId: jobId },
    });

    // Upload result to R2
    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);
    const base64 = img.base64 || img.dataUrl?.split(",")[1] || "";
    const buffer = Buffer.from(base64, "base64");
    const key = `assets/clone-jobs/${jobId}/redesigned/page-${String(page.pageNumber).padStart(3, "0")}.png`;

    const { url } = await uploadToR2({
      client: r2Client,
      config: r2Config,
      key,
      body: buffer,
      contentType: "image/png",
    });

    // Save redesigned URL on the page in Firestore
    const updatedPages = [...job.pages];
    updatedPages[pageIndex] = {
      ...updatedPages[pageIndex],
      redesignedUrl: url,
      redesignPrompt: basePrompt,
    } as typeof updatedPages[number] & { redesignedUrl: string; redesignPrompt: string };

    await docRef.update({
      pages: updatedPages,
      updatedAt: new Date().toISOString(),
    });

    await flushLangfuse();

    return NextResponse.json({
      success: true,
      url,
      pageIndex,
      previewUrl: img.dataUrl,
    });
  } catch (error) {
    console.error("[clone/redesign-page] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
