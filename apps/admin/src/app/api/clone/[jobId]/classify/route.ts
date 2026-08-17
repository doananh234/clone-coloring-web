import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import type { CloneJobPage } from "@vx/server-core/ai/clone-types";
import { cloneQueue } from "@/lib/queue/clone-queue";
import { enqueueCloneJob } from "@vx/clone-core/queue-enqueue";
import { withQueueTimeout, isQueueTimeout, queueUnavailableResponse } from "@/lib/queue/queue-timeout";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ jobId: string }> };
type Edit = { pageNumber: number; pageType?: CloneJobPage["pageType"]; excluded?: boolean };

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { jobId } = await params;
  const body = (await req.json().catch(() => ({}))) as { pages?: Edit[]; confirm?: boolean };
  const edits = body.pages ?? [];
  const confirm = body.confirm === true;

  const row = await prisma.cloneJob.findUnique({ where: { id: jobId } });
  if (!row) return NextResponse.json({ error: "Clone job not found" }, { status: 404 });

  // Merge edits into pages by pageNumber (only overwrite provided fields).
  const editByPage = new Map(edits.map((e) => [e.pageNumber, e]));
  const pages = ((row.pages as CloneJobPage[] | null) ?? []).map((p) => {
    const e = editByPage.get(p.pageNumber);
    if (!e) return p;
    return {
      ...p,
      ...(e.pageType !== undefined ? { pageType: e.pageType } : {}),
      ...(e.excluded !== undefined ? { excluded: e.excluded } : {}),
    };
  });

  const prevData = (row.data as Record<string, unknown> | null) ?? {};
  await prisma.cloneJob.update({
    where: { id: jobId },
    data: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pages: pages as any,
      ...(confirm
        ? { status: "queued", data: { ...prevData, classifyConfirmed: true } as never }
        : {}),
    },
  });

  if (confirm) {
    // Bound the enqueue so a down/unreachable Redis returns a clear 503 instead
    // of hanging the request forever (maxRetriesPerRequest:null queues commands
    // indefinitely). The row is already status=queued, so the reconciler will
    // re-enqueue it once the queue is back — mirrors the /start route.
    try {
      await withQueueTimeout(enqueueCloneJob(cloneQueue, jobId));
    } catch (err) {
      if (isQueueTimeout(err)) return queueUnavailableResponse({ jobId, confirmed: confirm });
      throw err;
    }
  }

  return NextResponse.json({ ok: true, confirmed: confirm });
}
