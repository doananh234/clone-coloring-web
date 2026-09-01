import { NextRequest, NextResponse } from "next/server";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { editImage } from "@vx/server-core/ai/image-provider";
import { REMOVE_FRAME_INSTRUCTION } from "@vx/server-core/ai/prompts";

// Book covers must be a fixed square. Gemini image-to-image returns a square when
// the source page is square (verified), and we also pass aspectRatio "1:1"; this
// final pass guarantees the exact 2048x2048 output (a clean upscale, no crop when
// the model already returned square).
const COVER_SIZE = 2048;

async function toSquareCoverBase64(base64: string, size = COVER_SIZE): Promise<string> {
  const img = await loadImage(Buffer.from(base64, "base64"));
  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  return canvas.toBuffer("image/png").toString("base64");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, imageDataUrls, brand, style, layout } = body as {
      title: string;
      imageDataUrls: string[];
      brand?: string;
      style?: string;
      layout?: string;
    };

    if (!title || !imageDataUrls?.length) {
      return NextResponse.json({ error: "title and imageDataUrls are required" }, { status: 400 });
    }

    const placement =
      layout === "bottom"
        ? "at the bottom"
        : layout === "center"
          ? "centered in the middle"
          : layout === "corner"
            ? "in the top-left corner"
            : "at the top";

    // Image-to-image: the FIRST selected illustration is the base being turned into
    // a cover; keep its scene/characters so the result matches the chosen page.
    const [primary, ...refs] = imageDataUrls;

    // Label each image by position so the model treats IMAGE 1 as the main
    // illustration to feature (and IMAGE 2+ as extras to incorporate), never
    // inventing a new scene or drawing something unrelated.
    let prompt: string;
    if (refs.length) {
      const n = 1 + refs.length;
      const extra = refs.length > 1 ? `IMAGE 2-${n}` : "IMAGE 2";
      prompt =
        `You are given ${n} coloring page illustrations IN THIS EXACT ORDER: ` +
        `IMAGE 1 = the MAIN illustration to feature; ${extra} = additional illustration(s) to also incorporate. ` +
        `Turn them into a professional coloring book COVER, keeping the EXACT characters, scenes and line-art from the provided images — do not invent a different scene.`;
    } else {
      prompt =
        `Turn the provided coloring page illustration (IMAGE 1) into a professional coloring book COVER. ` +
        `Keep the EXACT same characters, scene and line-art from IMAGE 1 — do not invent a different scene.`;
    }
    prompt += ` Add the title "${title}" in bold, decorative lettering ${placement}. Vibrant, polished, suitable as a commercial book cover, in a perfect SQUARE 1:1 layout.`;
    if (style && style.trim()) prompt += ` Coloring/art style: ${style.trim()}.`;
    if (brand && brand.trim()) prompt += ` Include the brand/author name "${brand.trim()}" in smaller text near the title.`;
    prompt += ` ${REMOVE_FRAME_INSTRUCTION}`;
    prompt += ` STRICT: full-bleed edge-to-edge, NO border, frame, outline, decorative edge, or margin on any side.`;

    const img = await editImage(primary, prompt, {
      aspectRatio: "1:1",
      referenceImageUrls: refs,
      trace: { caller: "compose-cover" },
    });
    // Guarantee an exact 2048x2048 square output.
    const base64 = await toSquareCoverBase64(img.base64);

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
