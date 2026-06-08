import { NextRequest, NextResponse } from "next/server";
import { visionAnalyzeJSON } from "@/lib/ai/llm-provider";
import { COLORING_STYLE_EXTRACTION_PROMPT } from "@/lib/ai/prompts";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageUrls } = body;

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return NextResponse.json(
        { error: "imageUrls array is required (1-3 images)" },
        { status: 400 },
      );
    }

    const parsed = await visionAnalyzeJSON<Record<string, unknown>>(
      imageUrls.slice(0, 3),
      COLORING_STYLE_EXTRACTION_PROMPT,
      { maxTokens: 20000, temperature: 0.3 },
    );

    return NextResponse.json({ success: true, ...parsed });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
