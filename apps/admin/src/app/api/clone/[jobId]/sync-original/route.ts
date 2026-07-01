import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import {
  getR2Config,
  createR2Client,
  uploadToR2,
  resolveR2Url,
} from "@vx/server-core/r2";
import { renderPdfToImages } from "@vx/server-core/pdf-renderer";
import type { CloneJobPage } from "@vx/server-core/ai/clone-types";

// Long timeout — rendering a large PDF page-by-page can take several minutes.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ jobId: string }> };

/**
 * Regenerate the original page images from the source PDF and merge them
 * back into cloneJob.pages by pageNumber. Preserves redesignedUrl, rawData,
 * status, and any other per-page fields already produced by the pipeline.
 *
 * Use when the render step failed or produced only partial pages and you want
 * to backfill the originals without re-running the whole clone flow.
 */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { jobId } = await params;

  const job = await prisma.cloneJob.findUnique({ where: { id: jobId } });
  if (!job) {
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  }
  if (!job.sourcePdfUrl) {
    return NextResponse.json(
      { error: "job has no sourcePdfUrl — cannot re-render" },
      { status: 400 },
    );
  }

  try {
    // 1. Fetch the source PDF from R2.
    const pdfUrl = resolveR2Url(job.sourcePdfUrl);
    const pdfRes = await fetch(pdfUrl);
    if (!pdfRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch source PDF from storage (HTTP ${pdfRes.status})` },
        { status: 502 },
      );
    }
    const pdfArrayBuffer = await pdfRes.arrayBuffer();

    // 2. Render pages to PNGs.
    const rendered = await renderPdfToImages(pdfArrayBuffer);
    if (rendered.length === 0) {
      return NextResponse.json(
        { error: "renderer produced 0 pages" },
        { status: 500 },
      );
    }

    // 3. Upload each PNG to R2 (parallel — same pattern as clone/route.ts).
    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);

    const uploaded = await Promise.all(
      rendered.map(async (page) => {
        const pageKey = `assets/clone-jobs/${jobId}/pages/page-${String(page.pageNumber).padStart(3, "0")}.png`;
        await uploadToR2({
          client: r2Client,
          config: r2Config,
          key: pageKey,
          body: page.pngBuffer,
          contentType: "image/png",
        });
        return { pageNumber: page.pageNumber, imageUrl: `/${pageKey}` };
      }),
    );

    // 4. Merge into existing pages by pageNumber. Preserve every non-image
    // field the pipeline already produced (redesignedUrl, rawData, status,
    // error, redesignPrompt, ...). Any new page numbers get appended as
    // fresh "pending" entries.
    const existing = (job.pages as unknown as CloneJobPage[] | null) ?? [];
    const byNumber = new Map<number, CloneJobPage>();
    for (const p of existing) byNumber.set(p.pageNumber, p);

    for (const u of uploaded) {
      const prev = byNumber.get(u.pageNumber);
      if (prev) {
        byNumber.set(u.pageNumber, { ...prev, imageUrl: u.imageUrl });
      } else {
        byNumber.set(u.pageNumber, {
          pageNumber: u.pageNumber,
          imageUrl: u.imageUrl,
          status: "pending",
        });
      }
    }

    const mergedPages = Array.from(byNumber.values()).sort(
      (a, b) => a.pageNumber - b.pageNumber,
    );

    await prisma.cloneJob.update({
      where: { id: jobId },
      data: {
        pages: mergedPages as never,
        totalPages: Math.max(job.totalPages, mergedPages.length),
      },
    });

    return NextResponse.json({
      success: true,
      jobId,
      updatedPages: uploaded.length,
      totalPages: mergedPages.length,
    });
  } catch (err) {
    console.error("[clone/sync-original] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
