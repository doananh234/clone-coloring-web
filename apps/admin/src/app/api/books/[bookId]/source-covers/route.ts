// apps/admin/src/app/api/books/[bookId]/source-covers/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { enqueueGenerationJob } from "@/lib/queue/generation-queue";
import { withQueueTimeout, isQueueTimeout, queueUnavailableResponse } from "@/lib/queue/queue-timeout";
import type { SourceCover, TitleSafePosition } from "@vx/coloring/data/source-covers";

type RouteParams = { params: Promise<{ bookId: string }> };
type Page = { id?: string; url?: string };

/**
 * POST — enqueue a background source-cover generation (Diaflow ~2min). Returns
 * immediately with the GenerationJob id so the operator can keep working; the
 * worker runs the gen, uploads to R2 and appends to book.data.sourceCovers.
 * Progress is tracked via GET /api/generation-jobs (global queue drawer).
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId } = await params;
    const { interiorPageId, titleSafe, prompt } = (await req.json().catch(() => ({}))) as {
      interiorPageId?: string; titleSafe?: TitleSafePosition; prompt?: string;
    };
    if (!interiorPageId || !titleSafe)
      return NextResponse.json({ error: "interiorPageId and titleSafe are required" }, { status: 400 });

    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

    const pages = (book.coloringPages as Page[] | null) ?? [];
    const interior = pages.find((p) => p.id === interiorPageId);
    if (!interior?.url)
      return NextResponse.json({ error: "Interior page not found" }, { status: 404 });

    const job = await prisma.generationJob.create({
      data: {
        type: "source-cover",
        status: "pending",
        bookId,
        bookTitle: book.title,
        // Snapshot the source thumb + inputs so the drawer can render without a
        // second lookup and the worker re-reads the page by id at run time.
        payload: {
          interiorPageId,
          titleSafe,
          prompt: typeof prompt === "string" && prompt.trim() ? prompt.trim() : undefined,
          sourceImageUrl: interior.url,
        },
      },
    });

    try {
      await withQueueTimeout(enqueueGenerationJob(job.id));
    } catch (err) {
      if (isQueueTimeout(err)) return queueUnavailableResponse({ jobId: job.id });
      throw err;
    }

    // Retention: opportunistically prune finished jobs older than 7 days so the
    // GenerationJob table (and the drawer feed) stays bounded without a cron.
    // Fire-and-forget — never blocks or fails the enqueue response.
    const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    prisma.generationJob
      .deleteMany({ where: { status: { in: ["done", "error"] }, createdAt: { lt: cutoff } } })
      .catch((e) => console.error("[source-covers] prune old jobs failed:", e));

    return NextResponse.json({ success: true, jobId: job.id, status: "pending" });
  } catch (error) {
    console.error("[books/source-covers POST] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

/** PATCH — toggle isPublic on one source cover. */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId } = await params;
    const { scId, isPublic } = (await req.json().catch(() => ({}))) as { scId?: string; isPublic?: boolean };
    if (!scId) return NextResponse.json({ error: "scId required" }, { status: 400 });

    // Only the `data` JSON is needed here — select it so the toggle doesn't load
    // the heavy coloringPages/summaryPages arrays on every source-cover PATCH.
    const book = await prisma.book.findUnique({ where: { id: bookId }, select: { data: true } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

    const data = (book.data as Record<string, unknown> | null) ?? {};
    const sourceCovers = ((data.sourceCovers as SourceCover[] | undefined) ?? []).map((c) =>
      c.id === scId ? { ...c, isPublic: isPublic ?? !c.isPublic } : c,
    );
    await prisma.book.update({ where: { id: bookId }, data: { data: { ...data, sourceCovers } as never } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[books/source-covers PATCH] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
