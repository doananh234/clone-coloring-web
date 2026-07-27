import type { CoverLayout, CoverText } from "../screens/books/cover-canvas";
import { COLORING_IMG_BASE } from "../data/config";

/**
 * Route the CDN image through the same-origin /coloring-img proxy so the canvas
 * isn't tainted (image.lagroups.org sends no CORS headers → toDataURL would throw).
 * Non-CDN / data: / already-same-origin URLs pass through unchanged.
 */
function toProxied(url: string): string {
  if (typeof window === "undefined" || url.startsWith("data:")) return url;
  try {
    const u = new URL(url, window.location.origin);
    const cdnHost = new URL(COLORING_IMG_BASE, window.location.origin).host;
    if (u.host === cdnHost && u.origin !== window.location.origin) {
      return `/coloring-img${u.pathname}${u.search}`;
    }
    return url;
  } catch {
    return url;
  }
}

export interface ComposeResult {
  blob: Blob;
  /** Bare base64 (no data: prefix) — for the upload-image endpoint. */
  base64: string;
  dataUrl: string;
}

/** Preview box width the CoverCanvas renders against (min(360px,100%)). */
const PREVIEW_W = 360;
const BG = "#efe8d9"; // --neutral-100 (cream)
const SUB_COLOR = "#2b251d"; // --carbon-800
const BADGE_BG = "#c9852a"; // --volt-500 (amber accent)
const BADGE_FG = "#1a1712"; // --carbon-950

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // allow toDataURL if the CDN sends CORS headers
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Không tải được ảnh nền bìa."));
    img.src = toProxied(src);
  });
}

/** Cover-fit draw (like CSS object-fit: cover) into a square canvas. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, side: number): void {
  const iw = img.naturalWidth || side;
  const ih = img.naturalHeight || side;
  const scale = Math.max(side / iw, side / ih);
  const w = iw * scale;
  const h = ih * scale;
  ctx.drawImage(img, (side - w) / 2, (side - h) / 2, w, h);
}

/** Word-wrap a string to fit maxWidth, returns lines. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = words[0];
  for (let i = 1; i < words.length; i++) {
    const test = `${line} ${words[i]}`;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = words[i];
    } else {
      line = test;
    }
  }
  lines.push(line);
  return lines;
}

/**
 * Render the cover client-side: base illustration + draggable title/subtitle/badge,
 * matching CoverCanvas's %-anchored layout at full image resolution. Faithful to the
 * old app's text-overlay result but computed in-browser (no server round-trip for export).
 */
export async function composeCover(
  imageUrl: string,
  text: CoverText,
  layout: CoverLayout,
  font: string,
): Promise<ComposeResult> {
  const img = await loadImage(imageUrl);
  const side = img.naturalWidth || img.naturalHeight || 1024;
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Không khởi tạo được canvas.");

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, side, side);
  drawCover(ctx, img, side);

  const scale = side / PREVIEW_W;
  const family = `${font}, "Space Grotesk", sans-serif`;
  // Ensure the selected web font is loaded before drawing, else the canvas falls
  // back to a system font in the exported PNG (the DOM preview may have loaded it,
  // but a just-picked font can still be pending). Failures are non-fatal.
  if (typeof document !== "undefined" && document.fonts) {
    try {
      await Promise.all([
        document.fonts.load(`700 ${layout.titleSize * scale}px "${font}"`),
        document.fonts.load(`500 ${13 * scale}px "${font}"`),
      ]);
    } catch {
      /* fall back to whatever is available */
    }
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Title — 82% width, weight 700, line-height 1.1, custom color/size.
  const titlePx = layout.titleSize * scale;
  ctx.font = `700 ${titlePx}px ${family}`;
  try { (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${-0.02 * titlePx}px`; } catch { /* older browsers ignore */ }
  ctx.fillStyle = layout.color || BADGE_FG;
  const titleX = (layout.title.x / 100) * side;
  const titleY = (layout.title.y / 100) * side;
  const titleLines = wrap(ctx, text.title || "", side * 0.82);
  const lineH = titlePx * 1.1;
  const startY = titleY - ((titleLines.length - 1) * lineH) / 2;
  titleLines.forEach((ln, i) => ctx.fillText(ln, titleX, startY + i * lineH));
  try { (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0px"; } catch { /* noop */ }

  // Subtitle — 13px @ preview scale, carbon-800, single line.
  if (text.subtitle) {
    ctx.font = `500 ${13 * scale}px ${family}`;
    ctx.fillStyle = SUB_COLOR;
    ctx.fillText(text.subtitle, (layout.sub.x / 100) * side, (layout.sub.y / 100) * side);
  }

  // Badge — volt pill, carbon text, 12px @ preview scale, padding 4×12.
  if (text.badge) {
    const badgePx = 12 * scale;
    const padX = 12 * scale;
    const padY = 4 * scale;
    ctx.font = `600 ${badgePx}px ${family}`;
    const tw = ctx.measureText(text.badge).width;
    const bw = tw + padX * 2;
    const bh = badgePx + padY * 2;
    const bx = (layout.badge.x / 100) * side;
    const by = (layout.badge.y / 100) * side;
    const r = bh / 2;
    ctx.fillStyle = BADGE_BG;
    ctx.beginPath();
    ctx.roundRect(bx - bw / 2, by - bh / 2, bw, bh, r);
    ctx.fill();
    ctx.fillStyle = BADGE_FG;
    ctx.fillText(text.badge, bx, by);
  }

  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL("image/png");
  } catch {
    throw new Error("Ảnh gốc chặn CORS nên không render được bìa phía client.");
  }
  const base64 = dataUrl.split(",")[1] ?? "";
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Không tạo được PNG."))), "image/png"),
  );
  return { blob, base64, dataUrl };
}
