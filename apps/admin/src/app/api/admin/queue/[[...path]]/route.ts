import { NextRequest, NextResponse } from "next/server";
import { cloneQueue } from "@/lib/queue/clone-queue";
import { adminAuth } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

async function requireAuth(req: NextRequest): Promise<NextResponse | null> {
  const authz = req.headers.get("authorization") ?? "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) return NextResponse.json({ error: "auth required" }, { status: 401 });
  try {
    await adminAuth.verifyIdToken(token);
    return null;
  } catch {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }
}

export async function GET(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

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
