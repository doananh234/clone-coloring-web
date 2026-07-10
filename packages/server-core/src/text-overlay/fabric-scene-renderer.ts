import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import { readFileSync } from "fs";
import { fetchGoogleFont } from "./google-fonts-loader";
import type { FabricSceneJSON, StyleFilter } from "./text-overlay-types";

interface RenderOptions {
  sceneJson: FabricSceneJSON;
  backgroundImageUrl: string;
  filter?: StyleFilter;
  size?: number;
}

interface TextboxObject extends Record<string, unknown> {
  type?: string;
  text: string;
  left: number;
  top: number;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fill?: string;
  width?: number;
  height?: number;
  angle?: number;
  scaleX?: number;
  scaleY?: number;
  textAlign?: CanvasTextAlign;
  originX?: "left" | "center" | "right";
  originY?: "top" | "center" | "bottom";
}

const DEFAULT_SIZE = 1024;

const FILTER_PARAMS: Record<
  StyleFilter,
  {
    saturation: number;
    brightness: number;
    contrast: number;
    sepia: number;
    grayscale: number;
    hueRotate: number;
  }
> = {
  none: { saturation: 1.0, brightness: 1.0, contrast: 1.0, sepia: 0.0, grayscale: 0.0, hueRotate: 0 },
  vintage: { saturation: 0.8, brightness: 1.0, contrast: 0.9, sepia: 0.3, grayscale: 0.0, hueRotate: 0 },
  warm: { saturation: 1.15, brightness: 1.05, contrast: 1.0, sepia: 0.1, grayscale: 0.0, hueRotate: 0 },
  cool: { saturation: 1.1, brightness: 1.0, contrast: 1.0, sepia: 0.0, grayscale: 0.0, hueRotate: (-15 * Math.PI) / 180 },
  monochrome: { saturation: 1.0, brightness: 1.0, contrast: 1.0, sepia: 0.0, grayscale: 1.0, hueRotate: 0 },
  sepia: { saturation: 1.0, brightness: 1.0, contrast: 1.0, sepia: 1.0, grayscale: 0.0, hueRotate: 0 },
  pastel: { saturation: 0.7, brightness: 1.1, contrast: 0.95, sepia: 0.0, grayscale: 0.0, hueRotate: 0 },
};

/**
 * Rebuild a Fabric.js scene on the server for pixel-perfect export.
 * Handles textbox objects with Google Font TTF loading. Other Fabric object
 * types are silently skipped (they would require Fabric parsing in Node,
 * which is heavier than this renderer needs to be).
 */
export async function renderFabricSceneToPng(opts: RenderOptions): Promise<Buffer> {
  const size = opts.size ?? DEFAULT_SIZE;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Background: fetch image, draw at cover-fill scale, apply filter if requested.
  const bgImage = await loadImage(opts.backgroundImageUrl);
  ctx.drawImage(bgImage, 0, 0, size, size);
  if (opts.filter && opts.filter !== "none") {
    applyFilter(ctx, size, size, FILTER_PARAMS[opts.filter]);
  }

  // Text objects: register fonts up-front, then draw.
  //
  // Fabric v7 changed the serialized `type` casing across releases. Older
  // versions emit "textbox"/"text"; some builds emit "Textbox"/"Text" (class
  // name). Rather than chase the casing, we accept ANYTHING with a string
  // `text` property — that's a Textbox / IText / Text in every Fabric v7
  // build we care about, and other object kinds don't carry `text`.
  const textObjs = (opts.sceneJson.objects ?? []).filter(
    (o): o is TextboxObject => {
      if (!o || typeof o !== "object") return false;
      const rec = o as Record<string, unknown>;
      if (typeof rec.text !== "string") return false;
      // Reject images / paths / groups that might carry an unrelated "text"
      // metadata field by cross-checking the type string when present.
      const t = typeof rec.type === "string" ? rec.type.toLowerCase() : "";
      if (t && !t.includes("text")) return false;
      return true;
    },
  );

  const uniqueFamilies = Array.from(
    new Set(textObjs.map((t) => t.fontFamily ?? "Inter")),
  );
  for (const family of uniqueFamilies) {
    try {
      const ttf = await fetchGoogleFont(family, 700);
      const buf = readFileSync(ttf);
      GlobalFonts.register(buf, family);
    } catch {
      // fall through — canvas uses fallback sans-serif
    }
  }

  for (const t of textObjs) {
    drawTextbox(ctx, t);
  }

  return canvas.toBuffer("image/png");
}

function drawTextbox(
  ctx: import("@napi-rs/canvas").SKRSContext2D,
  t: TextboxObject,
): void {
  if (!t.text) return;
  const family = t.fontFamily ?? "Inter";
  const size = t.fontSize ?? 40;
  const weight = t.fontWeight ?? "normal";
  ctx.font = `${weight} ${size}px "${family}"`;
  ctx.fillStyle = t.fill ?? "#000000";
  ctx.textAlign = t.textAlign ?? "left";
  ctx.textBaseline = "alphabetic";

  const scaleX = t.scaleX ?? 1;
  const scaleY = t.scaleY ?? 1;
  const angle = ((t.angle ?? 0) * Math.PI) / 180;
  const originX = t.originX ?? "left";
  const originY = t.originY ?? "top";

  const lines = t.text.split("\n");
  const lineHeight = size * 1.2;
  const blockHeight = lineHeight * lines.length;
  // Width used for horizontal origin math. Fabric v7 Textbox exports the
  // wrapping width and it stays fixed across scale.
  const blockWidth = t.width ?? size * 4;

  // Compute the top-left corner offsets from `left`/`top` given Fabric's
  // origin semantics (center / bottom etc).
  const dx =
    originX === "center" ? -(blockWidth * scaleX) / 2 :
    originX === "right" ? -(blockWidth * scaleX) :
    0;
  const dy =
    originY === "center" ? -(blockHeight * scaleY) / 2 :
    originY === "bottom" ? -(blockHeight * scaleY) :
    0;

  ctx.save();
  ctx.translate(t.left + dx, t.top + dy);
  ctx.rotate(angle);
  ctx.scale(scaleX, scaleY);
  // textAlign anchor within the block: center means x=blockWidth/2, right
  // means x=blockWidth, left/default means x=0.
  const anchorX =
    ctx.textAlign === "center" ? blockWidth / 2 :
    ctx.textAlign === "right" ? blockWidth :
    0;
  for (let i = 0; i < lines.length; i++) {
    // With baseline "alphabetic", y is the baseline. Push baseline down by
    // (i+1)*lineHeight so the first line's ascender starts near y=0.
    const y = (i + 1) * lineHeight - size * 0.2;
    ctx.fillText(lines[i], anchorX, y);
  }
  ctx.restore();
}

function applyFilter(
  ctx: import("@napi-rs/canvas").SKRSContext2D,
  w: number,
  h: number,
  p: {
    saturation: number;
    brightness: number;
    contrast: number;
    sepia: number;
    grayscale: number;
    hueRotate: number;
  },
): void {
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Grayscale
    if (p.grayscale > 0) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = r + (gray - r) * p.grayscale;
      g = g + (gray - g) * p.grayscale;
      b = b + (gray - b) * p.grayscale;
    }

    // Sepia
    if (p.sepia > 0) {
      const rr = 0.393 * r + 0.769 * g + 0.189 * b;
      const gg = 0.349 * r + 0.686 * g + 0.168 * b;
      const bb = 0.272 * r + 0.534 * g + 0.131 * b;
      r = r + (rr - r) * p.sepia;
      g = g + (gg - g) * p.sepia;
      b = b + (bb - b) * p.sepia;
    }

    // Saturation
    if (p.saturation !== 1) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * p.saturation;
      g = gray + (g - gray) * p.saturation;
      b = gray + (b - gray) * p.saturation;
    }

    // Brightness
    if (p.brightness !== 1) {
      r *= p.brightness;
      g *= p.brightness;
      b *= p.brightness;
    }

    // Contrast
    if (p.contrast !== 1) {
      r = (r - 128) * p.contrast + 128;
      g = (g - 128) * p.contrast + 128;
      b = (b - 128) * p.contrast + 128;
    }

    // Hue rotation via HSL
    if (p.hueRotate !== 0) {
      const [h, s, l] = rgbToHsl(r / 255, g / 255, b / 255);
      const nh = (h + p.hueRotate / (2 * Math.PI) + 1) % 1;
      const [nr, ng, nb] = hslToRgb(nh, s, l);
      r = nr * 255;
      g = ng * 255;
      b = nb * 255;
    }

    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
  }
  ctx.putImageData(imgData, 0, 0);
}

/**
 * Convert RGB (0-1) to HSL (h: 0-1, s: 0-1, l: 0-1).
 */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return [0, 0, l];
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    case b:
      h = ((r - g) / d + 4) / 6;
      break;
  }

  return [h, s, l];
}

/**
 * Convert HSL (h: 0-1, s: 0-1, l: 0-1) to RGB (0-1).
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  if (s === 0) {
    return [l, l, l];
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return [
    hue2rgb(p, q, h + 1 / 3),
    hue2rgb(p, q, h),
    hue2rgb(p, q, h - 1 / 3),
  ];
}
