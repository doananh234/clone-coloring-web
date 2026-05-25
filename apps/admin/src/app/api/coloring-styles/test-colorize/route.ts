import { NextRequest, NextResponse } from "next/server";
import { colorizeImage } from "@/lib/ai/image-provider";

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

    const img = await colorizeImage(imageUrl, colorizationDirective, { referenceImageUrls });

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
