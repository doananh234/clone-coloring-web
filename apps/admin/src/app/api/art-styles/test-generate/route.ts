import { NextRequest, NextResponse } from "next/server";
import { generateColoringPage } from "@/lib/ai/image-provider";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, generationDirective, referenceImageUrls } = body as {
      prompt: string;
      generationDirective: string;
      referenceImageUrls?: string[];
    };

    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const img = await generateColoringPage(prompt, {
      artStyle: generationDirective
        ? { generationDirective, referenceImageUrls: referenceImageUrls || [] }
        : undefined,
    });

    return NextResponse.json({
      success: true,
      dataUrl: img.dataUrl,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
