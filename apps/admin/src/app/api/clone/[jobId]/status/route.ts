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
    const d = (row.data as {
      currentStep?: string | null;
      runningStep?: string | null;
      runningSince?: string | null;
      runningBudgetSec?: number | null;
    } | null) ?? {};
    const currentStep = d.currentStep ?? null;
    return NextResponse.json({
      success: true,
      status: row.status,
      analyzedPages: row.analyzedPages,
      totalPages: row.totalPages,
      currentStep,
      // The detail screen polls this while a job is active. Without runningStep
      // here a transition like trim-pdf -> reproduce changes neither status nor
      // analyzedPages, so the full job query never refetches and the screen
      // keeps naming the wrong step.
      runningStep: d.runningStep ?? null,
      runningSince: d.runningSince ?? null,
      runningBudgetSec: d.runningBudgetSec ?? null,
      updatedAt: row.updatedAt.toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
