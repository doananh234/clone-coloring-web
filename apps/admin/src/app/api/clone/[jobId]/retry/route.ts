import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { cloneQueue } from "@/lib/queue/clone-queue";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ jobId: string }> };

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { jobId } = await params;

  await adminDb.collection("cloneJobs").doc(jobId).update({
    status: "queued",
    error: null,
    failedStep: null,
    updatedAt: new Date().toISOString(),
  });

  await cloneQueue.add("process", { cloneJobId: jobId }, { jobId });

  return NextResponse.json({ enqueued: jobId });
}
