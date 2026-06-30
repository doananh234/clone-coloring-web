import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { buildReproductionPrompt } from "@vx/server-core/ai/prompts";
import type { CloneJobPage, ClonePageRawData } from "@vx/server-core/ai/clone-types";

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

    const row = await prisma.cloneJob.findUnique({ where: { id: jobId } });

    if (!row) {
      return NextResponse.json({ error: "Clone job not found" }, { status: 404 });
    }

    const pages = (row.pages as CloneJobPage[]) || [];
    const pageIndex = pages.findIndex((p) => p.pageNumber === pageNum);

    if (pageIndex === -1) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    // Rebuild reproduction prompt from edited data
    const reproductionPrompt = buildReproductionPrompt(rawData);

    const updatedPages = [...pages];
    updatedPages[pageIndex] = {
      ...updatedPages[pageIndex],
      rawData: { ...rawData, reproductionPrompt },
      status: "analyzed",
    };

    await prisma.cloneJob.update({
      where: { id: jobId },
      data: { pages: updatedPages as any },
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
