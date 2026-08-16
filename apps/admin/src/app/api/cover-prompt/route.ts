// apps/admin/src/app/api/cover-prompt/route.ts
// Returns the built-in default cover-source prompt for a title-safe position, so
// the Source Cover dialog can prefill its editable prompt box from the real
// server baseline (no hardcoded copy on the client that could drift).
import { NextRequest, NextResponse } from "next/server";
import { buildCoverSourceBWPrompt } from "@vx/server-core/ai";

const VALID = new Set(["top", "middle", "bottom"]);

export async function GET(req: NextRequest) {
  const titleSafe = req.nextUrl.searchParams.get("titleSafe");
  if (!titleSafe || !VALID.has(titleSafe))
    return NextResponse.json({ error: "titleSafe must be one of top|middle|bottom" }, { status: 400 });

  const prompt = buildCoverSourceBWPrompt(titleSafe as "top" | "middle" | "bottom");
  return NextResponse.json({ titleSafe, prompt });
}
