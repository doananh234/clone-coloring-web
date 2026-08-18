import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { generateColoringPage } from "@vx/server-core/ai/image-provider";
import { getR2Config, createR2Client, uploadToR2 } from "@vx/server-core/r2";

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

    // Upload the preview to R2 and return its URL instead of a multi-MB base64
    // data URL — keeps the JSON response small and browser-cacheable.
    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);
    const key = `assets/style-tests/art-styles/${randomUUID()}.png`;
    const { url } = await uploadToR2({
      client: r2Client,
      config: r2Config,
      key,
      body: Buffer.from(img.base64, "base64"),
      contentType: "image/png",
    });

    return NextResponse.json({ success: true, url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
