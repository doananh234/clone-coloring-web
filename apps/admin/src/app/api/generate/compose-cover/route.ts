import { NextRequest, NextResponse } from "next/server";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { editImage, generateCoverSource, usesCompactPrompts } from "@vx/server-core/ai/image-provider";
import {
  buildCoverTypographyPrompt,
  buildCoverTypographyPromptCompact,
} from "@vx/server-core/cover-generation";

// Book covers must be a fixed square. Gemini image-to-image returns a square when
// the source page is square (verified), and we also pass aspectRatio "1:1"; this
// final pass guarantees the exact 2048x2048 output (a clean upscale, no crop when
// the model already returned square).
const COVER_SIZE = 2048;

// When the caller doesn't pass an explicit coloring/art style, tell the
// recompose pass to KEEP whatever colors the source illustration already has
// (the picked pages are usually already colored/rendered). This keeps the
// buildCoverSourcePrompt contract satisfied without forcing a palette shift.
const PRESERVE_STYLE_DIRECTIVE =
  "Keep the existing colors, palette, shading, lighting and rendering of the " +
  "source illustration exactly — do not change the color scheme, only recompose " +
  "the layout as instructed.";

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

/**
 * AI cover composition — now shares the EXACT building blocks the clone
 * pipeline's stepGenerateCover uses, so an interactive "gen bìa AI" in the
 * cover editor produces the same premium result as the batch pipeline (which
 * previously looked noticeably nicer):
 *
 *   Phase 1 — generateCoverSource: recompose the picked illustration into a
 *     book-cover LAYOUT (main art in the lower 55–70%, clean title-safe area up
 *     top with sparse on-brand background motifs) and (re)colorize it. Runs on
 *     Diaflow's GPT-image flow (forced inside generateCoverSource) — the single
 *     biggest quality difference vs the old ad-hoc "add a title at top/bottom"
 *     prompt on the default provider.
 *   Phase 2 — buildCoverTypographyPrompt: overlay KDP-style typography (title,
 *     subtitle, brand) using the curated font catalog, same as generateAiCover.
 *
 * The two-pass shape mirrors the pipeline (clean cover-source → typography) and
 * is why the output now matches. `layout` is accepted for backward-compat but
 * the pipeline-parity layout always keeps the title-safe area at the top.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, imageDataUrls, brand, style } = body as {
      title: string;
      imageDataUrls: string[];
      brand?: string;
      style?: string;
      layout?: string;
    };

    if (!title || !imageDataUrls?.length) {
      return NextResponse.json({ error: "title and imageDataUrls are required" }, { status: 400 });
    }

    // The FIRST selected illustration is the base being turned into a cover;
    // any extras act as style/scene references for the recompose pass.
    const [primary, ...refs] = imageDataUrls;
    const directive = style?.trim() ? style.trim() : PRESERVE_STYLE_DIRECTIVE;

    // Phase 1 — recompose into a clean, text-free cover-source layout (GPT-image
    // flow forced inside generateCoverSource). Same prompt the pipeline uses.
    const coverSource = await generateCoverSource(primary, directive, {
      aspectRatio: "1:1",
      referenceImageUrls: refs.length ? refs : undefined,
      trace: { caller: "compose-cover:source" },
    });

    // Phase 2 — overlay KDP typography (title + subtitle + brand) on the clean
    // cover source. buildCoverTypographyPrompt takes the title as a hint and
    // renders all three text roles per the shared spec.
    // KingCong caps prompts at 4000 chars → use the compact typography variant.
    const buildTypography = usesCompactPrompts()
      ? buildCoverTypographyPromptCompact
      : buildCoverTypographyPrompt;
    const typographyPrompt = buildTypography(brand?.trim() || "", {
      titleHint: title,
    });
    const composed = await editImage(coverSource.dataUrl, typographyPrompt, {
      aspectRatio: "1:1",
      flow: "gpt_image",
      trace: { caller: "compose-cover:typography" },
    });

    // Guarantee an exact 2048x2048 square output.
    const base64 = await toSquareCoverBase64(composed.base64);

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
