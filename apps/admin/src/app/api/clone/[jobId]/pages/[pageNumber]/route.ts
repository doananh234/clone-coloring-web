import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { buildReproductionPrompt } from "@/lib/ai/prompts";
import type { CloneJob, ClonePageRawData } from "@/lib/ai/clone-types";

type RouteParams = { params: Promise<{ jobId: string; pageNumber: string }> };

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { jobId, pageNumber } = await params;
    const pageNum = parseInt(pageNumber, 10);

    if (isNaN(pageNum) || pageNum < 1) {
      return NextResponse.json({ error: "Invalid page number" }, { status: 400 });
    }

    const body = await req.json();
    const { rawData } = body as { rawData: Omit<ClonePageRawData, "reproductionPrompt"> };

    if (!rawData) {
      return NextResponse.json({ error: "rawData required" }, { status: 400 });
    }

    const docRef = adminDb.collection("cloneJobs").doc(jobId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Clone job not found" }, { status: 404 });
    }

    const job = doc.data() as CloneJob;
    const pageIndex = job.pages.findIndex((p) => p.pageNumber === pageNum);

    if (pageIndex === -1) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    // Rebuild reproduction prompt from edited data
    const reproductionPrompt = buildReproductionPrompt(rawData);

    const updatedPages = [...job.pages];
    updatedPages[pageIndex] = {
      ...updatedPages[pageIndex],
      rawData: { ...rawData, reproductionPrompt },
      status: "analyzed",
    };

    await docRef.update({
      pages: updatedPages,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, page: updatedPages[pageIndex] });
  } catch (error) {
    console.error("[clone/edit-page] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
