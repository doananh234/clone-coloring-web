import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { getR2Config, createR2Client, uploadToR2, resolveR2Url } from "@vx/server-core/r2";
import { generateCategoryIcon } from "@vx/server-core/ai";

async function uploadIcon(base64Data: string, categoryId: string): Promise<string> {
  const buffer = Buffer.from(base64Data, "base64");
  const r2Config = getR2Config();
  const r2Client = createR2Client(r2Config);
  const key = `category-icons/${categoryId}/icon-${Date.now()}.png`;
  const { url } = await uploadToR2({
    client: r2Client,
    config: r2Config,
    key,
    body: buffer,
    contentType: "image/png",
  });
  return resolveR2Url(url);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, categoryId, action, previewBase64 } = body as {
      prompt: string;
      categoryId?: string;
      action: "generate" | "upload";
      previewBase64?: string;
    };

    if (action === "generate") {
      if (!prompt) {
        return NextResponse.json({ error: "prompt required" }, { status: 400 });
      }
      const img = await generateCategoryIcon(prompt);
      return NextResponse.json({ success: true, previewUrl: img.dataUrl, base64: img.base64 });
    }

    if (action === "upload") {
      if (!categoryId) {
        return NextResponse.json({ error: "categoryId required" }, { status: 400 });
      }
      if (!previewBase64) {
        return NextResponse.json({ error: "previewBase64 required" }, { status: 400 });
      }

      const imageUrl = await uploadIcon(previewBase64, categoryId);

      await prisma.category.update({
        where: { id: categoryId },
        data: { iconUrl: imageUrl },
      });

      return NextResponse.json({ success: true, imageUrl });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
