import { NextRequest, NextResponse } from "next/server";
import { editImage } from "@/lib/ai/image-provider";

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

    const blendPrompt =
      prompt ||
      "This is a colorful illustrated book cover with text overlaid on it. There may be text at the TOP (title/header) and text at the BOTTOM (footer/subtitle). Make ALL text blend naturally into the illustration style — match the art style for the lettering while keeping every piece of text perfectly readable and correctly spelled. IMPORTANT: Preserve ALL original colors, characters, illustration details, AND every text element (both top and bottom) exactly as they are. Only modify how the text integrates visually into the art style. Do not remove any text, do not convert to black and white, do not change the color palette.";

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
