import { NextRequest, NextResponse } from "next/server";
import { generateColoringPage } from "@vx/server-core/ai";
import { flushLangfuse } from "@vx/server-core/langfuse";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, characterReferenceImageUrls, locationReferenceImageUrls, artStyle, provider: providerRaw } = body as {
      prompt: string;
      characterReferenceImageUrls?: string[];
      locationReferenceImageUrls?: string[];
      artStyle?: { referenceImageUrls: string[]; generationDirective: string };
      provider?: string;
    };
    const provider = providerRaw === "kingcong" || providerRaw === "diaflow" ? providerRaw : undefined;

    if (!prompt) {
      return NextResponse.json({ error: "prompt required" }, { status: 400 });
    }

    const img = await generateColoringPage(prompt, {
      characterReferenceImageUrls,
      locationReferenceImageUrls,
      artStyle,
      provider,
      trace: { caller: "generate/coloring-page" },
    });

    await flushLangfuse();

    return NextResponse.json({
      success: true,
      previewUrl: img.dataUrl,
      base64: img.base64,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
