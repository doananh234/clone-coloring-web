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
