import { NextRequest, NextResponse } from "next/server";
import { renderTextOverlay } from "@/lib/canvas/text-renderer";
import type { TextOverlayRequest } from "@/lib/text-overlay/text-overlay-types";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as TextOverlayRequest;
    const { imageUrl, header, footer } = body;

    if (!imageUrl) {
      return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
    }

    if (!header?.text && !footer?.text) {
      return NextResponse.json({ error: "At least one text block is required" }, { status: 400 });
    }

    // Download or decode source image
    let imageBuffer: Buffer;
    if (imageUrl.startsWith("data:")) {
      const base64 = imageUrl.split(",")[1];
      imageBuffer = Buffer.from(base64, "base64");
    } else {
      const res = await fetch(imageUrl);
      if (!res.ok) {
        return NextResponse.json(
          { error: `Failed to download source image (${res.status})` },
          { status: 400 },
        );
      }
      imageBuffer = Buffer.from(await res.arrayBuffer());
    }

    const pngBuffer = await renderTextOverlay(imageBuffer, { header, footer });
    const base64 = pngBuffer.toString("base64");

    return NextResponse.json({
      success: true,
      previewUrl: `data:image/png;base64,${base64}`,
      base64,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
