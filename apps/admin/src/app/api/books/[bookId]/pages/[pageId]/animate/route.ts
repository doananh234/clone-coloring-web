import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import type { BookColoringPage } from "@vx/coloring/data/additional-pages";
import { enqueueGenerationJob } from "@/lib/queue/generation-queue";
import { withQueueTimeout, isQueueTimeout, queueUnavailableResponse } from "@/lib/queue/queue-timeout";

type RouteParams = { params: Promise<{ bookId: string; pageId: string }> };

/**
 * Generate a short "self-animating" MP4 for one page — now via the Gemini Veo
 * video API (image→video), not the old local motion service. Veo renders take
 * ~3–8 min, far beyond Cloudflare's ~100s HTTP limit (previously a hard 500/524),
 * so the work runs as a background GenerationJob (type "animate"); the worker
 * calls videoFromImage → downloads the clip → uploads to R2 → writes
 * animationUrl onto the page. The client polls GET /api/generation-jobs/[id].
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId, pageId } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      format?: "9:16" | "1:1" | "16:9";
      durationSec?: number;
      prompt?: string;
    };

    // Fast-fail validation so the caller gets an immediate 404 instead of a
    // background job that only errors on poll.
    const book = await prisma.book.findUnique({ where: { id: bookId }, select: { coloringPages: true, title: true } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
    const pages = (book.coloringPages as unknown as BookColoringPage[]) ?? [];
    if (!pages.some((p) => p.id === pageId)) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    const job = await prisma.generationJob.create({
      data: {
        type: "animate",
        status: "pending",
        bookId,
        bookTitle: book.title ?? undefined,
        payload: {
          bookId,
          pageId,
          format: body.format ?? "9:16",
          durationSec: body.durationSec ?? 6,
          prompt: body.prompt?.trim() || undefined,
        },
      },
    });

    try {
      await withQueueTimeout(enqueueGenerationJob(job.id));
    } catch (err) {
      if (isQueueTimeout(err)) return queueUnavailableResponse({ jobId: job.id, bookId });
      throw err;
    }

    return NextResponse.json({ success: true, jobId: job.id, bookId, status: "pending" });
  } catch (error) {
    console.error("[books/page-animate POST] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
