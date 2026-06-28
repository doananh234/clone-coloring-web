import { NextResponse } from "next/server";
import { cloneQueue } from "@/lib/queue/clone-queue";

export const dynamic = "force-dynamic";

export async function POST() {
  await cloneQueue.pause();
  return NextResponse.json({ paused: true });
}
