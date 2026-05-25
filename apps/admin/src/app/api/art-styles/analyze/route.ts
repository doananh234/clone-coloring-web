import { NextRequest, NextResponse } from "next/server";
import { chatCompletion } from "@/lib/ai/llm-provider";
import { ART_STYLE_EXTRACTION_PROMPT } from "@/lib/ai/prompts";
import type { LLMMessagePart } from "@/lib/ai/llm-provider";

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

    // Build content parts: image_url parts for each image + text prompt
    const contentParts: LLMMessagePart[] = [
      ...imageUrls.slice(0, 3).map((url: string) => ({
        type: "image_url" as const,
        image_url: { url },
      })),
      { type: "text" as const, text: ART_STYLE_EXTRACTION_PROMPT },
    ];

    const response = await chatCompletion([{ role: "user", content: contentParts }], {
      jsonMode: true,
      maxTokens: 20000,
      temperature: 0.3,
    });

    const parsed = JSON.parse(response.content);
    return NextResponse.json({ success: true, ...parsed });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
