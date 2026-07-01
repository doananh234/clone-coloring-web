/**
 * Server-side text renderer using @napi-rs/canvas.
 * Draws text overlay (header + footer) onto a source image.
 */

import type { TextOverlayConfig, TextBlockConfig } from "../text-overlay/text-overlay-types";
import { fetchGoogleFont } from "../text-overlay/google-fonts-loader";

/** Text fits within this fraction of canvas width. */
const MAX_TEXT_WIDTH_RATIO = 0.95;
/** Header base size as fraction of canvas width. */
const HEADER_SIZE_RATIO = 0.07;
/** Footer base size as fraction of canvas width. */
const FOOTER_SIZE_RATIO = 0.04;
/** Max lines allowed before shrinking font further. */
const MAX_LINES_HEADER = 2;
const MAX_LINES_FOOTER = 1;

type CanvasModule = typeof import("@napi-rs/canvas");

async function loadCanvasModule(): Promise<CanvasModule> {
  return await import("@napi-rs/canvas");
}

async function registerFont(
  napiCanvas: CanvasModule,
  fontFamily: string,
): Promise<string> {
  const weight = 700; // Bold for cover text
  const ttfPath = await fetchGoogleFont(fontFamily, weight);
  const registeredName = `overlay-${fontFamily.replace(/\s+/g, "-")}`;
  napiCanvas.GlobalFonts.registerFromPath(ttfPath, registeredName);
  return registeredName;
}

/**
 * Wrap text into multiple lines that fit within maxWidth.
 * Splits on word boundaries.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapText(ctx: any, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines.length > 0 ? lines : [text];
}

/**
 * Calculate font size that fits text within maxWidth and maxLines.
 * Shrinks until wrapText() produces <= maxLines lines.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateFontSize(
  ctx: any,
  text: string,
  baseFontSize: number,
  maxWidth: number,
  fontName: string,
  scale: number,
  maxLines: number,
): number {
  let fontSize = baseFontSize * scale;
  const minSize = fontSize * 0.3;

  ctx.font = `bold ${fontSize}px "${fontName}"`;
  let lines = wrapText(ctx, text, maxWidth);

  while (lines.length > maxLines && fontSize > minSize) {
    fontSize -= 2;
    ctx.font = `bold ${fontSize}px "${fontName}"`;
    lines = wrapText(ctx, text, maxWidth);
  }

  return fontSize;
}

function getTextX(
  position: string,
  canvasWidth: number,
  textWidth: number,
): number {
  if (position === "bottom-left") {
    return canvasWidth * 0.05;
  }
  if (position === "bottom-right") {
    return canvasWidth - textWidth - canvasWidth * 0.05;
  }
  // "top", "center", "bottom-center" → horizontally centered
  return (canvasWidth - textWidth) / 2;
}

function getTextY(
  position: string,
  canvasHeight: number,
  fontSize: number,
): number {
  if (position === "top") {
    return fontSize * 1.3;
  }
  if (position === "center") {
    return canvasHeight / 2 + fontSize / 3;
  }
  // "bottom-left", "bottom-center", "bottom-right"
  return canvasHeight - fontSize * 0.6;
}

function drawTextBlock(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  block: TextBlockConfig,
  fontName: string,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const isHeader = block.position === "top" || block.position === "center";
  const baseRatio = isHeader ? HEADER_SIZE_RATIO : FOOTER_SIZE_RATIO;
  const baseFontSize = canvasWidth * baseRatio;
  const maxWidth = canvasWidth * MAX_TEXT_WIDTH_RATIO;

  const maxLines = isHeader ? MAX_LINES_HEADER : MAX_LINES_FOOTER;
  const fontSize = calculateFontSize(
    ctx,
    block.text,
    baseFontSize,
    maxWidth,
    fontName,
    block.scale,
    maxLines,
  );

  ctx.font = `bold ${fontSize}px "${fontName}"`;
  ctx.textBaseline = "middle";

  // Wrap text into lines that fit within maxWidth
  const lines = wrapText(ctx, block.text, maxWidth);
  const lineHeight = fontSize * 1.2;
  const totalTextHeight = lines.length * lineHeight;

  // Calculate starting Y based on position, adjusted for multi-line
  const baseY = getTextY(block.position, canvasHeight, fontSize);
  const startY = block.position === "center"
    ? baseY - (totalTextHeight - lineHeight) / 2
    : block.position === "top"
      ? baseY
      : baseY - (totalTextHeight - lineHeight); // bottom positions: shift up for extra lines

  // Shadow setup (once, applies to all lines)
  if (block.shadow) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = fontSize * 0.1;
    ctx.shadowOffsetX = fontSize * 0.03;
    ctx.shadowOffsetY = fontSize * 0.06;
  }

  // Draw each line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineMetrics = ctx.measureText(line);
    const x = getTextX(block.position, canvasWidth, lineMetrics.width);
    const y = startY + i * lineHeight;

    // Outline (draw first so fill renders on top)
    if (block.outlineWidth > 0 && block.outlineColor !== "transparent") {
      ctx.strokeStyle = block.outlineColor;
      ctx.lineWidth = block.outlineWidth * 2;
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.strokeText(line, x, y);
    }

    // Fill
    ctx.fillStyle = block.color;
    ctx.fillText(line, x, y);
  }

  // Reset shadow
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/**
 * Render text overlay onto a source image buffer.
 * Returns the composited image as a PNG buffer.
 */
export async function renderTextOverlay(
  imageBuffer: Buffer,
  config: TextOverlayConfig,
): Promise<Buffer> {
  const napiCanvas = await loadCanvasModule();

  // Load source image
  const image = await napiCanvas.loadImage(imageBuffer);
  const canvas = napiCanvas.createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");

  // Draw source image
  ctx.drawImage(image, 0, 0);

  // Register and draw header text
  if (config.header?.text) {
    const fontName = await registerFont(napiCanvas, config.header.fontFamily);
    drawTextBlock(ctx, config.header, fontName, canvas.width, canvas.height);
  }

  // Register and draw footer text
  if (config.footer?.text) {
    const fontName = await registerFont(napiCanvas, config.footer.fontFamily);
    drawTextBlock(ctx, config.footer, fontName, canvas.width, canvas.height);
  }

  const pngData = await canvas.encode("png");
  return Buffer.from(pngData);
}
