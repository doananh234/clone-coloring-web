import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@vx/db";
import { enqueueGenerationJob } from "@/lib/queue/generation-queue";
import { withQueueTimeout, isQueueTimeout, queueUnavailableResponse } from "@/lib/queue/queue-timeout";

/**
 * Colorize one page (or source-cover) — now ASYNC. The colorize provider chain
 * (kingcong → diaflow → gemini-web → azure) runs serially; a slow/stuck primary
 * (KingCong polls up to ~600s) meant the inline request blew past Cloudflare's
 * ~100s HTTP limit (error 524) before any fallback could complete. Instead of
 * doing the work here we enqueue a background GenerationJob (type "colorize");
 * the worker runs the exact colorize→upload→book-patch pipeline. The frontend
 * polls GET /api/generation-jobs/[id] for the result.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      imageUrl,
      coloringStyleId,
      coloringVariantId,
      bookId,
      pageId,
      useReference = true,
      target = "page",
      provider: providerRaw,
    } = body as {
      imageUrl: string;
      coloringStyleId: string;
      coloringVariantId?: string;
      bookId?: string;
      pageId?: string;
      useReference?: boolean;
      target?: "page" | "sourceCover";
      provider?: string;
    };

    if (!imageUrl) return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
    if (!coloringStyleId) return NextResponse.json({ error: "coloringStyleId is required" }, { status: 400 });

    // Fast-fail validation (cheap DB read) so operators get an immediate 400
    // instead of a background job that only errors on poll.
    const style = await prisma.coloringStyle.findUnique({ where: { id: coloringStyleId } });
    if (!style) return NextResponse.json({ error: "Coloring style not found" }, { status: 404 });

    type Variant = { id?: string; colorizationDirective?: string };
    const variant = coloringVariantId
      ? ((style.variants as Variant[] | null) || []).find((v) => v?.id === coloringVariantId)
      : undefined;
    const directive = (variant?.colorizationDirective || style.colorizationDirective || "").trim();
    if (!directive) {
      return NextResponse.json(
        { error: "Coloring style/variant has no colorizationDirective" },
        { status: 400 },
      );
    }

    const provider =
      providerRaw === "kingcong" || providerRaw === "diaflow" || providerRaw === "litellm" || providerRaw === "azure"
        ? providerRaw
        : undefined;

    // GenerationJob.bookId is required for polling. Book colorize always has one;
    // the test/preview path (no bookId) gets a synthetic id (worker skips the
    // book patch when payload.bookId is absent).
    const effectiveBookId = bookId?.trim() || `colorize-${crypto.randomUUID()}`;
    let bookTitle: string | undefined;
    if (bookId?.trim()) {
      const book = await prisma.book.findUnique({ where: { id: bookId }, select: { title: true } });
      bookTitle = book?.title ?? undefined;
    }

    const job = await prisma.generationJob.create({
      data: {
        type: "colorize",
        status: "pending",
        bookId: effectiveBookId,
        bookTitle,
        payload: {
          imageUrl,
          coloringStyleId,
          coloringVariantId: coloringVariantId ?? undefined,
          bookId: bookId?.trim() || undefined,
          pageId: pageId ?? undefined,
          useReference,
          target,
          provider,
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
