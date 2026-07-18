import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import type { CloneJobPage } from "@vx/server-core/ai/clone-types";
import { patchJobPage, updateBookPageUrl } from "../reproduce/helpers";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ jobId: string }> };

const KINDS = ["regen", "angle", "redesign"] as const;
type CandidateKind = (typeof KINDS)[number];

function candidateUrl(page: CloneJobPage, kind: CandidateKind): string {
  switch (kind) {
    case "regen":
      return page.regenCandidateUrl || "";
    case "angle":
      return page.angleCandidateUrl || "";
    case "redesign":
      return page.redesignedUrl || "";
  }
}

/**
 * Applies a previously generated candidate (or reverts to the original
 * redesign) as the page's current result: sets reproducedUrl and points the
 * book's coloring page at it. Candidates are kept so the user can switch
 * back and forth.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;
    const body = await req.json().catch(() => ({}));
    const { pageIndex, kind } = body as { pageIndex?: number; kind?: CandidateKind };

    if (pageIndex === undefined || pageIndex === null) {
      return NextResponse.json({ error: "pageIndex required" }, { status: 400 });
    }
    if (!kind || !KINDS.includes(kind)) {
      return NextResponse.json({ error: `kind must be one of: ${KINDS.join(", ")}` }, { status: 400 });
    }

    const row = await prisma.cloneJob.findUnique({ where: { id: jobId } });
    if (!row) {
      return NextResponse.json({ error: "Clone job not found" }, { status: 404 });
    }

    const pages = (row.pages as CloneJobPage[]) || [];
    const page = pages[pageIndex];
    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    const url = candidateUrl(page, kind);
    if (!url) {
      return NextResponse.json({ error: `No ${kind} candidate for this page` }, { status: 404 });
    }

    const patched = await patchJobPage(jobId, pageIndex, (target) => ({
      ...target,
      reproducedUrl: url,
      // The camera view becomes the page's official view only once the
      // angle candidate is actually chosen.
      ...(kind === "angle" && target.angleCandidateView && target.rawData
        ? {
            rawData: {
              ...target.rawData,
              scene: { ...target.rawData.scene, cameraView: target.angleCandidateView },
            },
          }
        : {}),
    }));
    if (!patched) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    if (row.bookId) {
      await updateBookPageUrl(row.bookId, pageIndex, url);
    }

    return NextResponse.json({ success: true, pageIndex, kind, url });
  } catch (error) {
    console.error("[clone/apply-candidate] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
