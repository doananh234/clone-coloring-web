import { NextRequest, NextResponse } from "next/server";
import { prisma, jsonPath } from "@vx/db";
import { getR2Config, createR2Client, resolveR2Url } from "@vx/server-core/r2";
import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import type { S3Client } from "@aws-sdk/client-s3";
import { removeQueuedCloneJob } from "@vx/clone-core/queue-enqueue";
import { cloneQueue } from "@/lib/queue/clone-queue";
import { withQueueTimeout, isQueueTimeout } from "@/lib/queue/queue-timeout";
import type { CloneJob, CloneJobPage } from "@vx/server-core/ai/clone-types";

type RouteParams = { params: Promise<{ jobId: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;
    // `?lite=1` drops the heavy per-page `rawData` (scene/characters/prompts) and
    // bookData/entityMap — for consumers that only render page thumbnails (e.g.
    // the book-detail "Sách gốc" section), which otherwise pull the full analysis.
    const lite = new URL(req.url).searchParams.get("lite") === "1";
    const row = await prisma.cloneJob.findUnique({ where: { id: jobId } });

    if (!row) {
      return NextResponse.json({ error: "Clone job not found" }, { status: 404 });
    }

    const extra = (row.data as any) || {};
    const pages = (row.pages as CloneJobPage[]) || [];

    // Resolve R2 URLs for client display (and strip rawData in lite mode).
    const resolvedPages = pages.map((p) => {
      const { rawData, ...rest } = p;
      return {
        ...(lite ? rest : p),
        imageUrl: resolveR2Url(p.imageUrl),
        redesignedUrl: p.redesignedUrl ? resolveR2Url(p.redesignedUrl) : undefined,
      };
    });

    const job: CloneJob = {
      id: row.id,
      name: row.name,
      status: row.status as CloneJob["status"],
      sourceFileName: row.sourceFileName || "",
      // Resolve the source PDF ("book gốc") to its CDN URL — it is stored as a
      // relative R2 key ("/assets/…"), so returning it raw makes the client link
      // resolve against the admin origin instead of the asset CDN.
      sourcePdfUrl: row.sourcePdfUrl ? resolveR2Url(row.sourcePdfUrl) : "",
      totalPages: row.totalPages,
      analyzedPages: row.analyzedPages,
      pages,
      bookData: lite ? undefined : ((row.bookData as any) ?? undefined),
      entityMap: lite ? undefined : ((row.entityMap as any) ?? undefined),
      bookId: row.bookId ?? undefined,
      resultBookId: row.resultBookId ?? undefined,
      error: row.error ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      ...extra,
    };

    return NextResponse.json({
      success: true,
      job: { ...job, pages: resolvedPages },
    });
  } catch (error) {
    console.error("[clone/get] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

/**
 * Delete every object under an R2 prefix, paginating the list (ListObjectsV2
 * caps at 1000 keys) and chunking deletes (DeleteObjects caps at 1000 keys).
 * Best-effort: a book with 40+ interior pages plus regen variants can exceed a
 * single page, so we must loop rather than trusting one round-trip.
 */
async function deleteR2Prefix(client: S3Client, bucket: string, prefix: string): Promise<number> {
  let deleted = 0;
  let ContinuationToken: string | undefined;
  do {
    const listed = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken }),
    );
    const keys = (listed.Contents ?? []).map((o) => o.Key).filter((k): k is string => !!k);
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      if (batch.length === 0) continue;
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })) },
        }),
      );
      deleted += batch.length;
    }
    ContinuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return deleted;
}

/**
 * Delete a clone job and everything it produced:
 *  - the BullMQ queue record (so the worker never resurrects a ghost job),
 *  - the Book(s) it created + their R2 assets (assets/{bookId}/*),
 *  - the job's own R2 assets (assets/clone-jobs/{jobId}/*),
 *  - the CloneJob DB row.
 *
 * The upstream SourceBook (the source PDF) is intentionally KEPT — it can be
 * shared by multiple clone jobs (re-clone lineage), so removing it here would
 * orphan sibling jobs.
 *
 * Each external side effect (queue, R2) is best-effort: a failure there must not
 * block deleting the DB row, otherwise a job with a dead queue/Redis connection
 * could never be removed.
 */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;
    const row = await prisma.cloneJob.findUnique({ where: { id: jobId } });

    if (!row) {
      return NextResponse.json({ error: "Clone job not found" }, { status: 404 });
    }

    // 1. Pull it out of the BullMQ queue (best-effort — Redis may be down locally,
    //    and an actively-processing job can't be removed; neither should block delete).
    //    withQueueTimeout caps the wait so an unreachable Redis (which never rejects
    //    under maxRetriesPerRequest:null) can't wedge the whole delete.
    try {
      const removal = await withQueueTimeout(removeQueuedCloneJob(cloneQueue, jobId));
      if (!removal.removed && removal.state === "active") {
        console.warn(`[clone/delete] job ${jobId} is active in the worker; deleting DB record anyway`);
      }
    } catch (queueError) {
      if (isQueueTimeout(queueError)) {
        console.warn(`[clone/delete] queue removal timed out for ${jobId} (Redis unreachable?); continuing`);
      } else {
        console.warn("[clone/delete] queue removal failed (non-fatal):", queueError);
      }
    }

    // 2. Collect every Book this job produced. Prefer the denormalized pointers on
    //    the job row, then sweep for any Book that back-links via data.cloneJobId
    //    (covers re-run books whose id was never written back to cloneJob.bookId).
    const bookIds = new Set<string>();
    if (row.bookId) bookIds.add(row.bookId);
    if (row.resultBookId) bookIds.add(row.resultBookId);
    try {
      const linked = await prisma.book.findMany({
        where: { data: { path: jsonPath(["cloneJobId"]), equals: jobId } },
        select: { id: true },
      });
      linked.forEach((b) => bookIds.add(b.id));
    } catch (lookupError) {
      console.warn("[clone/delete] book back-link lookup failed (non-fatal):", lookupError);
    }

    // 3. R2 cleanup — job assets + each book's assets. Best-effort.
    let r2Deleted = 0;
    try {
      const r2Config = getR2Config();
      const r2Client = createR2Client(r2Config);
      r2Deleted += await deleteR2Prefix(r2Client, r2Config.bucket, `assets/clone-jobs/${jobId}/`);
      for (const bookId of bookIds) {
        r2Deleted += await deleteR2Prefix(r2Client, r2Config.bucket, `assets/${bookId}/`);
      }
    } catch (r2Error) {
      console.warn("[clone/delete] R2 cleanup failed (non-fatal):", r2Error);
    }

    // 4. Delete the Book rows, then the CloneJob row.
    if (bookIds.size > 0) {
      await prisma.book.deleteMany({ where: { id: { in: [...bookIds] } } });
    }
    await prisma.cloneJob.delete({ where: { id: jobId } });

    return NextResponse.json({
      success: true,
      deletedBooks: [...bookIds],
      r2ObjectsDeleted: r2Deleted,
    });
  } catch (error) {
    console.error("[clone/delete] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
