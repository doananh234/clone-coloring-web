import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";

type RouteParams = { params: Promise<{ jobId: string }> };

/**
 * Tiny progress endpoint for polling an active clone job WITHOUT re-pulling the
 * heavy job body (all pages + rawData) every few seconds. The detail hook polls
 * this and only refetches the full job when status/analyzedPages actually change.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;
    const row = await prisma.cloneJob.findUnique({
      where: { id: jobId },
      select: { status: true, analyzedPages: true, totalPages: true, updatedAt: true, data: true },
    });
    if (!row) {
      return NextResponse.json({ error: "Clone job not found" }, { status: 404 });
    }
    const currentStep = (row.data as { currentStep?: string | null } | null)?.currentStep ?? null;
    return NextResponse.json({
      success: true,
      status: row.status,
      analyzedPages: row.analyzedPages,
      totalPages: row.totalPages,
      currentStep,
      updatedAt: row.updatedAt.toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
