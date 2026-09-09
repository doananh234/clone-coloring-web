import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import type { BookColoringPage } from "@vx/coloring/data/additional-pages";
import { enqueueGenerationJob } from "@/lib/queue/generation-queue";
import { withQueueTimeout, isQueueTimeout, queueUnavailableResponse } from "@/lib/queue/queue-timeout";

type RouteParams = { params: Promise<{ bookId: string; pageId: string }> };

/**
 * Job-independent single-page regen PREVIEW — now ASYNC. The image-to-image
 * redraw runs the provider chain (kingcong→diaflow→…) which can exceed
 * Cloudflare's ~100s HTTP limit (error 524), so the work is enqueued as a
 * background GenerationJob (type "regen"); the worker builds the redraw prompt,
 * calls editImage, and uploads a candidate to R2 (the book is NOT modified). The
 * client polls GET /api/generation-jobs/[id] and previews resultUrl.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId, pageId } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      newAngle?: boolean;
      provider?: string;
      artStyleId?: string;
      instructions?: string;
      /** Full replacement prompt from the intro regen dialog. */
      promptOverride?: string;
      /** "summary" = an intro page (book.summaryPages). Default: an interior. */
      target?: "page" | "summary";
    };
    const target = body.target === "summary" ? "summary" : undefined;
    const promptOverride =
      typeof body.promptOverride === "string" ? body.promptOverride.trim() || undefined : undefined;
    const provider =
      body.provider === "kingcong" || body.provider === "diaflow" || body.provider === "litellm" || body.provider === "azure"
        ? body.provider
        : undefined;

    // Fast-fail validation so the caller gets an immediate 404.
    const book = await prisma.book.findUnique({
      where: { id: bookId },
      select: { coloringPages: true, summaryPages: true, title: true },
    });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
    // Intro pages are a separate column, so look in the list the caller named.
    const column = target === "summary" ? book.summaryPages : book.coloringPages;
    const pages = (column as unknown as BookColoringPage[]) ?? [];
    const page = pages.find((p) => p.id === pageId);
    if (!page?.url) return NextResponse.json({ error: "Page not found" }, { status: 404 });

    const job = await prisma.generationJob.create({
      data: {
        type: "regen",
        status: "pending",
        bookId,
        bookTitle: book.title ?? undefined,
        payload: {
          bookId,
          pageId,
          newAngle: Boolean(body.newAngle),
          artStyleId: body.artStyleId || undefined,
          instructions: typeof body.instructions === "string" ? body.instructions.trim() || undefined : undefined,
          promptOverride,
          target,
          provider,
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
    console.error("[books/page-regen POST] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
