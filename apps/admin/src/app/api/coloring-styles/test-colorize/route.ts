import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { colorizeImage } from "@vx/server-core/ai/image-provider";
import { getR2Config, createR2Client, uploadToR2, resolveR2Url } from "@vx/server-core/r2";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageUrl, colorizationDirective, referenceImageUrls } = body as {
      imageUrl: string;
      colorizationDirective: string;
      referenceImageUrls?: string[];
    };

    if (!imageUrl) {
      return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
    }
    if (!colorizationDirective) {
      return NextResponse.json({ error: "colorizationDirective is required" }, { status: 400 });
    }

    // Resolve relative R2 paths (upload-image returns "/key") to full CDN URLs so
    // the image provider can fetch them server-side — same as the batch colorize route.
    const img = await colorizeImage(resolveR2Url(imageUrl), colorizationDirective, {
      referenceImageUrls: (referenceImageUrls || []).map(resolveR2Url),
    });

    // Upload the preview to R2 and return its URL instead of a multi-MB base64
    // data URL — keeps the JSON response small and browser-cacheable.
    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);
    const key = `assets/style-tests/coloring-styles/${randomUUID()}.png`;
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
