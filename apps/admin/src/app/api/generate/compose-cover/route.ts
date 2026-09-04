import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { enqueueGenerationJob } from "@/lib/queue/generation-queue";
import { withQueueTimeout, isQueueTimeout, queueUnavailableResponse } from "@/lib/queue/queue-timeout";

/**
 * AI cover composition — now ASYNC. KingCong's image calls run ~150s each and the
 * 2-phase compose (source → typography) took 100–300s inline, which blew past
 * Cloudflare's ~100s HTTP timeout (error 524). Instead of doing the work here we
 * enqueue a background GenerationJob (type "compose-cover"); the worker reproduces
 * the exact 2-phase pipeline (generateCoverSource → editImage typography →
 * 2048x2048 square) and uploads the final PNG to R2. The frontend polls
 * GET /api/generation-jobs for the result.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, imageDataUrls, brand, style, bookId } = body as {
      title: string;
      imageDataUrls: string[];
      brand?: string;
      style?: string;
      bookId?: string;
      layout?: string;
    };

    if (!title || !imageDataUrls?.length) {
      return NextResponse.json({ error: "title and imageDataUrls are required" }, { status: 400 });
    }

    // bookId scopes the GenerationJob so the frontend can poll by book. The cover
    // wizard may run before the book is persisted (bookId "temp"); fall back to a
    // synthetic id so the poll filter still matches this job uniquely.
    const effectiveBookId = bookId?.trim() || `compose-${crypto.randomUUID()}`;

    // Best-effort book title for the queue drawer; missing book (temp flow) is fine.
    let bookTitle = title;
    if (bookId?.trim()) {
      const book = await prisma.book.findUnique({ where: { id: bookId }, select: { title: true } });
      if (book?.title) bookTitle = book.title;
    }

    const job = await prisma.generationJob.create({
      data: {
        type: "compose-cover",
        status: "pending",
        bookId: effectiveBookId,
        bookTitle,
        payload: {
          title,
          imageDataUrls,
          brand: brand?.trim() || undefined,
          style: style?.trim() || undefined,
          bookId: effectiveBookId,
        },
      },
    });

    try {
      await withQueueTimeout(enqueueGenerationJob(job.id));
    } catch (err) {
      if (isQueueTimeout(err)) return queueUnavailableResponse({ jobId: job.id, bookId: effectiveBookId });
      throw err;
    }

    return NextResponse.json({ success: true, jobId: job.id, bookId: effectiveBookId, status: "pending" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
