// apps/admin/src/app/api/books/[bookId]/export-zip/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { collectExportPlan, stableExportUrl, type ExportInput, type ExportPageLike } from "@vx/server-core/book-export";
import { enqueueGenerationJob } from "@/lib/queue/generation-queue";
import { withQueueTimeout, isQueueTimeout, queueUnavailableResponse } from "@/lib/queue/queue-timeout";

type RouteParams = { params: Promise<{ bookId: string }> };

/**
 * POST — compute the export plan hash for this book and either:
 *   1. Return the cached ZIP link immediately (book.data.export.hash matches), or
 *   2. Return the id of an already-running book-export job (dedup in-flight), or
 *   3. Create a new book-export GenerationJob, enqueue it, and return { jobId }.
 *
 * There is NO synchronous GET export anymore. The heavy ZIP build runs in the
 * background worker; the operator polls /api/generation-jobs for status and
 * downloads via the cached R2 link once the job is done.
 */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId } = await params;

    // Load book + its source CloneJob (needed for the export plan hash).
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

    const data = (book.data as Record<string, unknown> | null) ?? {};
    const cloneJobId = typeof data.cloneJobId === "string" ? data.cloneJobId : undefined;
    const cloneJob = cloneJobId
      ? await prisma.cloneJob.findUnique({ where: { id: cloneJobId } })
      : null;

    const input: ExportInput = {
      bookTitle: book.title,
      bookData: data,
      coverUrl: book.coverUrl,
      summaryPages: (book.summaryPages as ExportPageLike[] | null) ?? [],
      coloringPages: (book.coloringPages as ExportPageLike[] | null) ?? [],
      cloneJobPages: (cloneJob?.pages as ExportPageLike[] | null) ?? null,
      cloneJobId,
    };

    const plan = collectExportPlan(input);

    // 1. Cache hit — content hash matches AND the stored url is the current
    //    stable key. The url check auto-migrates a book still holding an
    //    old hash-named url from the previous version: same content but
    //    old-format url → treated as a miss → one rebuild writes the stable key.
    const cached = data.export as { url?: string; hash?: string; filename?: string } | undefined;
    if (cached?.hash === plan.hash && cached.url === stableExportUrl(bookId)) {
      return NextResponse.json({
        success: true,
        cached: true,
        url: cached.url,
        filename: cached.filename ?? plan.filename,
        hash: plan.hash,
      });
    }

    // 2. Dedup — a job for this book is already pending or running; reuse it.
    const inflight = await prisma.generationJob.findFirst({
      where: { bookId, type: "book-export", status: { in: ["pending", "running"] } },
      orderBy: { createdAt: "desc" },
    });
    if (inflight && (inflight.payload as { hash?: string } | null)?.hash === plan.hash) {
      return NextResponse.json({
        success: true,
        cached: false,
        jobId: inflight.id,
        status: inflight.status,
        message: "Export job already in progress",
      });
    }

    // 3. Create + enqueue a new book-export job.
    const job = await prisma.generationJob.create({
      data: {
        type: "book-export",
        status: "pending",
        bookId,
        bookTitle: book.title,
        payload: { hash: plan.hash, filename: plan.filename },
      },
    });

    try {
      await withQueueTimeout(enqueueGenerationJob(job.id));
    } catch (err) {
      if (isQueueTimeout(err)) return queueUnavailableResponse({ jobId: job.id });
      throw err;
    }

    return NextResponse.json({ success: true, cached: false, jobId: job.id, status: "pending" });
  } catch (error) {
    console.error("[books/export-zip POST] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
