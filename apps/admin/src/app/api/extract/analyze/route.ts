import { NextRequest, NextResponse } from "next/server";
import { visionAnalyzeJSON, EXTRACTION_PROMPT } from "@/lib/ai";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageUrl } = body as { imageUrl: string };

    if (!imageUrl) {
      return NextResponse.json({ error: "imageUrl required" }, { status: 400 });
    }

    const result = await visionAnalyzeJSON<{ characters: unknown[]; locations: unknown[] }>(
      imageUrl,
      EXTRACTION_PROMPT,
      { maxTokens: 4000, temperature: 0.3 },
    );

    return NextResponse.json({
      success: true,
      characters: result.characters || [],
      locations: result.locations || [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
