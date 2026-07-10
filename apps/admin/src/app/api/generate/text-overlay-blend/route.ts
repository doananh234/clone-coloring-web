import { NextRequest, NextResponse } from "next/server";
import { editImage } from "@vx/server-core/ai/image-provider";
import { BLEND_PROMPT } from "@vx/server-core/text-overlay";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageBase64, prompt } = body as {
      imageBase64: string;
      prompt?: string;
    };

    if (!imageBase64) {
      return NextResponse.json({ error: "imageBase64 is required" }, { status: 400 });
    }

    const dataUrl = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:image/png;base64,${imageBase64}`;

    const blendPrompt = prompt || BLEND_PROMPT;

    const img = await editImage(dataUrl, blendPrompt);

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
