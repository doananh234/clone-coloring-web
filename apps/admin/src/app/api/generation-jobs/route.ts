// apps/admin/src/app/api/generation-jobs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";

export const dynamic = "force-dynamic";

/**
 * GET — recent background generation jobs for the global queue drawer.
 * Optional filters: ?status=pending,running  ?bookId=...  ?limit=30
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 30, 1), 100);
    const bookId = searchParams.get("bookId") || undefined;
    const statusParam = searchParams.get("status");
    const statuses = statusParam ? statusParam.split(",").map((s) => s.trim()).filter(Boolean) : undefined;

    const jobs = await prisma.generationJob.findMany({
      where: {
        ...(bookId ? { bookId } : {}),
        ...(statuses && statuses.length ? { status: { in: statuses } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ success: true, jobs });
  } catch (error) {
    console.error("[generation-jobs GET] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

// Only terminal jobs may be deleted: removing a pending/running row would race
// the worker (it updates that row on completion) and orphan the queue record.
const TERMINAL = { status: { in: ["done", "error"] } };

/**
 * DELETE — remove finished jobs from the queue drawer (history cleanup).
 *   ?id=<jobId>        delete one finished job
 *   (no id)            bulk-clear ALL finished jobs (optionally ?bookId=…)
 * pending/running jobs are never deleted.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id") || undefined;
    const bookId = searchParams.get("bookId") || undefined;

    if (id) {
      const res = await prisma.generationJob.deleteMany({ where: { id, ...TERMINAL } });
      if (res.count === 0)
        return NextResponse.json({ error: "Chỉ xóa được mục đã xong hoặc lỗi" }, { status: 409 });
      return NextResponse.json({ success: true, deleted: res.count });
    }

    const res = await prisma.generationJob.deleteMany({
      where: { ...TERMINAL, ...(bookId ? { bookId } : {}) },
    });
    return NextResponse.json({ success: true, deleted: res.count });
  } catch (error) {
    console.error("[generation-jobs DELETE] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
