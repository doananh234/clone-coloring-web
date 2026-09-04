// apps/admin/src/app/api/generation-jobs/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET — one background GenerationJob by id. Used by the interactive cover-gen
 * pollers (compose-cover, ai-cover) which hold the exact jobId and just need to
 * watch status → done/error and read resultUrl / error.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const job = await prisma.generationJob.findUnique({ where: { id } });
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    return NextResponse.json({ success: true, job });
  } catch (error) {
    console.error("[generation-jobs/[id] GET] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
