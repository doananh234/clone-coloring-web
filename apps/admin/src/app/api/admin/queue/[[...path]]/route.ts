import { NextRequest, NextResponse } from "next/server";
import { cloneQueue } from "@/lib/queue/clone-queue";
import { requireOperator } from "@/lib/auth/require-operator";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireOperator(req);
  if ("error" in auth) return auth.error;

  const [counts, isPaused] = await Promise.all([
    cloneQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed", "paused"),
    cloneQueue.isPaused(),
  ]);

  return NextResponse.json({
    queue: "clone-jobs",
    paused: isPaused,
    counts,
  });
}
