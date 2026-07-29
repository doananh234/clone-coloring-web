import { NextRequest, NextResponse } from "next/server";
import { colorizeImage } from "@vx/server-core/ai/image-provider";
import { resolveR2Url } from "@vx/server-core/r2";

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
