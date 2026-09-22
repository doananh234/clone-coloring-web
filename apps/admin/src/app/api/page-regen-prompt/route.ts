// apps/admin/src/app/api/page-regen-prompt/route.ts
// Returns the built-in default single-page regen prompt, so the intro regen
// dialog can prefill its editable box from the real server baseline (no
// hardcoded copy on the client that could drift). Mirrors /api/cover-prompt.
import { NextRequest, NextResponse } from "next/server";
import { buildPageRegenPrompt, frameInstruction } from "@vx/server-core/ai/prompts";

export async function GET(req: NextRequest) {
  const newAngle = req.nextUrl.searchParams.get("newAngle") === "1";
  const prompt = buildPageRegenPrompt({
    // The worker picks a concrete camera view per run; the box just needs to
    // show the shape of the instruction, so name the placeholder plainly.
    cameraView: newAngle ? "different" : undefined,
    frame: frameInstruction(),
  });
  return NextResponse.json({ prompt });
}

export const dynamic = "force-dynamic";
