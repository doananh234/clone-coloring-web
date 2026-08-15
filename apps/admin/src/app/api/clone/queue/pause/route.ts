import { NextResponse } from "next/server";
import { cloneQueue } from "@/lib/queue/clone-queue";
import { withQueueTimeout, isQueueTimeout, queueUnavailableResponse } from "@/lib/queue/queue-timeout";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await withQueueTimeout(cloneQueue.pause());
    return NextResponse.json({ paused: true });
  } catch (err) {
    if (isQueueTimeout(err)) return queueUnavailableResponse();
    throw err;
  }
}
