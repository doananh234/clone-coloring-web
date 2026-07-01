import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { recheckOneShotSession } from "@vx/server-core/ai/llm-provider";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ jobId: string }> };

/**
 * Debug endpoint — re-parse the raw response of the LAST Diaflow one-shot
 * session run for this job. Does NOT trigger a new Diaflow API call; only
 * polls the existing session for its current status + payload and returns
 * both the raw result and the parsed pages so operators can inspect exactly
 * what the flow returned.
 *
 * Requires `cloneJob.data.oneShotSessionId` — populated by stepOneShot right
 * after the initial Diaflow call succeeds.
 */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { jobId } = await params;

  const job = await prisma.cloneJob.findUnique({ where: { id: jobId } });
  if (!job) {
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  }

  const data = (job.data as Record<string, unknown> | null | undefined) ?? {};
  let sessionId = typeof data.oneShotSessionId === "string" ? data.oneShotSessionId : "";
  let sourceFrom: "cloneJob" | "sourceBook" | "none" = sessionId ? "cloneJob" : "none";

  // Fallback: the one-shot step also mirrors sessionId onto SourceBook.data
  // (survives CloneJob deletion). If CloneJob has no session yet — e.g. the
  // worker crashed before it wrote back — check SourceBook.
  if (!sessionId) {
    const sourceBookId = typeof data.sourceBookId === "string" ? data.sourceBookId : "";
    if (sourceBookId) {
      const sb = await prisma.sourceBook.findUnique({ where: { id: sourceBookId } });
      const sbData = (sb?.data as Record<string, unknown> | null | undefined) ?? {};
      if (typeof sbData.oneShotSessionId === "string" && sbData.oneShotSessionId) {
        sessionId = sbData.oneShotSessionId;
        sourceFrom = "sourceBook";
      }
    }
  }

  if (!sessionId) {
    return NextResponse.json(
      {
        error:
          "No stored oneShotSessionId (checked CloneJob.data and SourceBook.data). Job has not completed a Diaflow one-shot call yet.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await recheckOneShotSession(sessionId);
    return NextResponse.json({
      jobId,
      sessionId: result.sessionId,
      sessionSource: sourceFrom,
      diaflowStatus: result.status,
      pageCount: result.pages.length,
      pages: result.pages,
      parseError: result.parseError ?? null,
      raw: result.raw ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      {
        jobId,
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
