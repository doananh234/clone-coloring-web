import { NextRequest, NextResponse } from "next/server";
import { generateImage } from "@/lib/ai/image-provider";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, imageDataUrls } = body as {
      title: string;
      imageDataUrls: string[];
    };

    if (!title || !imageDataUrls?.length) {
      return NextResponse.json({ error: "title and imageDataUrls are required" }, { status: 400 });
    }

    const count = imageDataUrls.length;
    const layoutHint =
      count <= 2 ? "side by side in a row" : count <= 4 ? "in a 2x2 grid" : "in a collage layout";

    const prompt = `Professional coloring book cover for "${title}". Compose ${count} colorful coloring page illustrations ${layoutHint} into one eye-catching book cover. Add the title "${title}" in bold, decorative lettering at the top. Vibrant, polished, suitable as a commercial book cover.`;

    const img = await generateImage(prompt, { size: "1024x1024" });

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
