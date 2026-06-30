import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { cloneQueue } from "@/lib/queue/clone-queue";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ jobId: string }> };

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { jobId } = await params;

  await prisma.cloneJob.update({
    where: { id: jobId },
    data: { status: "queued" },
  });

  await cloneQueue.add("process", { cloneJobId: jobId }, { jobId });

  return NextResponse.json({ enqueued: jobId });
}
