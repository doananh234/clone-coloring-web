import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { editImage } from "@vx/server-core/ai";
import { buildRedesignPrompt } from "@vx/server-core/ai/prompts";
import { getR2Config, createR2Client, uploadToR2, resolveR2Url } from "@vx/server-core/r2";
import { flushLangfuse } from "@vx/server-core/langfuse";
import { planFillInterior, DEFAULT_TARGET_INTERIOR } from "@vx/clone-core";
import type { CloneJobPage } from "@vx/server-core/ai/clone-types";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ jobId: string }> };

/** Fisher–Yates (server-side, non-deterministic — fine for source variety). */
function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Manual "Fill lại": top up interior pages to the job's target. Idempotent by
 *  count — recomputes need = target - existing on every call. */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;
    const row = await prisma.cloneJob.findUnique({ where: { id: jobId } });
    if (!row) return NextResponse.json({ error: "Clone job not found" }, { status: 404 });

    const pages = (row.pages as CloneJobPage[]) || [];
    const data = (row.data as { targetInteriorCount?: number } | null) ?? {};
    const target = data.targetInteriorCount ?? DEFAULT_TARGET_INTERIOR;

    const tasks = planFillInterior(pages, target, { shuffle });
    if (tasks.length === 0) {
      return NextResponse.json({ success: true, added: 0 });
    }

    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);
    const created: CloneJobPage[] = [];
    for (const t of tasks) {
      const img = await editImage(resolveR2Url(t.sourceImageUrl), buildRedesignPrompt(t.changePercent), {
        trace: { caller: "clone/fill-interior", entityType: "cloneJob", entityId: jobId },
      });
      const base64 = img.base64 || img.dataUrl?.split(",")[1] || "";
      const buffer = Buffer.from(base64, "base64");
      const key = `assets/clone-jobs/${jobId}/redesigned/page-${String(t.pageNumber).padStart(3, "0")}.png`;
      const { url } = await uploadToR2({ client: r2Client, config: r2Config, key, body: buffer, contentType: "image/png" });
      created.push({
        pageNumber: t.pageNumber,
        imageUrl: t.sourceImageUrl,
        redesignedUrl: url,
        status: "reproduced",
        pageType: "interior",
        origin: "additional",
        parentPageNumber: t.parentPageNumber,
      });
    }

    const fresh = await prisma.cloneJob.findUnique({ where: { id: jobId }, select: { pages: true } });
    const base = (fresh?.pages as CloneJobPage[] | null) ?? [];
    await prisma.cloneJob.update({
      where: { id: jobId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { pages: [...base, ...created] as any },
    });
    await flushLangfuse();

    return NextResponse.json({ success: true, added: created.length });
  } catch (error) {
    console.error("[clone/fill-interior] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
