import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { editImage } from "@vx/server-core/ai";
import { buildRedesignPrompt } from "@vx/server-core/ai/prompts";
import { getR2Config, createR2Client, uploadToR2, resolveR2Url } from "@vx/server-core/r2";
import { flushLangfuse } from "@vx/server-core/langfuse";
import type { CloneJobPage } from "@vx/server-core/ai/clone-types";

export const maxDuration = 120;

type RouteParams = { params: Promise<{ jobId: string; pageNumber: string }> };

/** Regenerate an ADDITIONAL page in place: re-run image-to-image on its source
 *  (imageUrl = parent) at the operator-chosen change-%, overwriting redesignedUrl. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { jobId, pageNumber } = await params;
    const pageNum = parseInt(pageNumber, 10);
    if (isNaN(pageNum)) return NextResponse.json({ error: "Invalid page number" }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as { changePercent?: number; provider?: string };
    const pct = Math.min(95, Math.max(5, body.changePercent || 30));
    const provider =
      body.provider === "kingcong" || body.provider === "diaflow" || body.provider === "litellm" || body.provider === "azure"
        ? body.provider
        : undefined;

    const row = await prisma.cloneJob.findUnique({ where: { id: jobId } });
    if (!row) return NextResponse.json({ error: "Clone job not found" }, { status: 404 });

    const pages = (row.pages as CloneJobPage[]) || [];
    const idx = pages.findIndex((p) => p.pageNumber === pageNum);
    if (idx === -1) return NextResponse.json({ error: "Page not found" }, { status: 404 });
    if (pages[idx].origin !== "additional") {
      return NextResponse.json({ error: "Only additional pages can be regenerated in place" }, { status: 400 });
    }

    const img = await editImage(resolveR2Url(pages[idx].imageUrl), buildRedesignPrompt(pct), {
      provider,
      trace: { caller: "clone/page-regen", entityType: "cloneJob", entityId: jobId },
    });
    const base64 = img.base64 || img.dataUrl?.split(",")[1] || "";
    const buffer = Buffer.from(base64, "base64");
    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);
    const key = `assets/clone-jobs/${jobId}/redesigned/page-${String(pageNum).padStart(3, "0")}.png`;
    const { url } = await uploadToR2({ client: r2Client, config: r2Config, key, body: buffer, contentType: "image/png" });

    const updated = [...pages];
    updated[idx] = { ...updated[idx], redesignedUrl: `${url}?v=${Date.now()}` };
    await prisma.cloneJob.update({
      where: { id: jobId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { pages: updated as any },
    });
    await flushLangfuse();

    return NextResponse.json({ success: true, url });
  } catch (error) {
    console.error("[clone/page-regen] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
