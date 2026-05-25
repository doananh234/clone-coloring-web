import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { colorizeImage } from "@/lib/ai/image-provider";
import { resolveR2Url } from "@/lib/r2";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageUrl, coloringStyleId } = body as {
      imageUrl: string;
      coloringStyleId: string;
    };

    if (!imageUrl || !coloringStyleId) {
      return NextResponse.json(
        { error: "imageUrl and coloringStyleId are required" },
        { status: 400 },
      );
    }

    const styleDoc = await adminDb.collection("coloringStyles").doc(coloringStyleId).get();
    if (!styleDoc.exists) {
      return NextResponse.json({ error: "Coloring style not found" }, { status: 404 });
    }
    const style = styleDoc.data()!;

    if (!style.colorizationDirective) {
      return NextResponse.json(
        { error: "Coloring style has no colorizationDirective" },
        { status: 400 },
      );
    }

    const referenceImageUrls = (style.referenceImages || []).map((r: { url: string }) =>
      resolveR2Url(r.url),
    );
    const img = await colorizeImage(resolveR2Url(imageUrl), style.colorizationDirective, {
      referenceImageUrls,
    });

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
