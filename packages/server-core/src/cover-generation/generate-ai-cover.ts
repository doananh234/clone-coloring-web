import { editImage, usesCompactPrompts } from "../ai";
import { getR2Config, createR2Client, uploadToR2 } from "../r2";
import { buildCoverTypographyPrompt, buildCoverTypographyPromptCompact } from "./prompt";
import type { CoverInput, CoverOutput } from "./types";

// One R2 client per worker / server process. cover-export route and
// stepGenerateCover both go through this.
const r2Config = getR2Config();
const r2Client = createR2Client(r2Config);


/**
 * AI cover generation — single call, shared by every consumer.
 *
 *   1. Build the KDP-style typography prompt (buildCoverTypographyPrompt),
 *      injecting the brand name and optional title / subtitle hints.
 *   2. Feed the clean illustration URL into `editImage(url, prompt)`.
 *   3. Upload the returned bytes to R2 under the caller-provided key.
 *   4. Return a cache-busted URL + the base64 bytes for instant preview.
 *
 * The worker's stepGenerateCover and the admin's cover-export route both
 * call this so a prompt tweak, a font-catalog change, or a brand-handling
 * fix propagates everywhere without a two-file sync burden.
 */
export async function generateAiCover(input: CoverInput): Promise<CoverOutput> {
  // KingCong caps prompts at 4000 chars → use the compact typography variant so
  // it isn't rejected ("Mô tả tối đa 4000 ký tự") / tail-truncated. Diaflow and
  // the other providers keep the full spec.
  const buildTypography = usesCompactPrompts()
    ? buildCoverTypographyPromptCompact
    : buildCoverTypographyPrompt;
  const prompt = buildTypography(input.brandName, {
    titleHint: input.titleHint,
    subtitleHint: input.subtitleHint,
  });

  // editImage normalizes the output to an exact 2048x2048 (aspectRatio 1:1) —
  // see ai/normalize-image.ts — so the cover is always the fixed KDP square.
  const generated = await editImage(input.cleanImageUrl, prompt, {
    aspectRatio: "1:1",
    ...(input.model ? { model: input.model } : {}),
    trace: input.trace,
  });
  const base64 = generated.base64;
  const pngBuffer = Buffer.from(base64, "base64");

  const { url } = await uploadToR2({
    client: r2Client,
    config: r2Config,
    key: input.r2Key,
    body: pngBuffer,
    contentType: "image/png",
  });

  // Cache-bust so the browser <img> element re-fetches even when we overwrite
  // the same R2 key across generations. R2 ignores the query string.
  const bustedUrl = `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;

  return {
    url: bustedUrl,
    base64,
  };
}
