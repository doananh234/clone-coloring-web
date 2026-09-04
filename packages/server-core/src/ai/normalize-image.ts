import type { GeneratedImage } from "./image-provider-types";

/**
 * Force EVERY generated image to a fixed 2048x2048 square, regardless of the
 * model's output size or aspect. Image models (Gemini/LiteLLM) ignore the `size`
 * param and return a fixed ~1024px canvas, so covers/pages come back at 1024 and
 * sometimes non-square. We cover-fit (scale to fill) + center-crop to an exact
 * 2048x2048 PNG — the single square size KDP covers and interior pages need.
 */
export const OUTPUT_SIZE = 2048;

/**
 * Return the image re-encoded at exactly OUTPUT_SIZE x OUTPUT_SIZE. No-op
 * (returns the input) when the bytes are missing or already exactly that size.
 */
export async function normalizeGeneratedImage(img: GeneratedImage): Promise<GeneratedImage> {
  if (!img?.base64) return img;

  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const src = await loadImage(Buffer.from(img.base64, "base64"));
  if (src.width === OUTPUT_SIZE && src.height === OUTPUT_SIZE) return img;

  // Cover-fit: scale so the image fills the square, then center-crop the overflow.
  const scale = Math.max(OUTPUT_SIZE / src.width, OUTPUT_SIZE / src.height);
  const dw = src.width * scale;
  const dh = src.height * scale;
  const canvas = createCanvas(OUTPUT_SIZE, OUTPUT_SIZE);
  canvas.getContext("2d").drawImage(src, (OUTPUT_SIZE - dw) / 2, (OUTPUT_SIZE - dh) / 2, dw, dh);

  const base64 = canvas.toBuffer("image/png").toString("base64");
  return { ...img, base64, dataUrl: `data:image/png;base64,${base64}` };
}
