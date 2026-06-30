import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { colorizeImage } from "@vx/server-core/ai/image-provider";
import { resolveR2Url } from "@vx/server-core/r2";

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

    const style = await prisma.coloringStyle.findUnique({ where: { id: coloringStyleId } });
    if (!style) {
      return NextResponse.json({ error: "Coloring style not found" }, { status: 404 });
    }

    if (!style.colorizationDirective) {
      return NextResponse.json(
        { error: "Coloring style has no colorizationDirective" },
        { status: 400 },
      );
    }

    const referenceImageUrls = ((style.referenceImages as { url: string }[]) || []).map((r) =>
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
