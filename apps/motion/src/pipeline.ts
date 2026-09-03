import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { svgPathProperties } from "svg-path-properties";
import { trace } from "potrace";
import ffmpegStatic from "ffmpeg-static";

/**
 * Turn a coloring-page line-art image into a "self-drawing" MP4:
 *   1. potrace → SVG outline paths
 *   2. sample each path into a polyline (once)
 *   3. render frames where each path is progressively stroked (pen effect),
 *      staggered by length so the drawing builds up naturally
 *   4. pipe raw RGBA frames into ffmpeg → H.264 MP4
 *
 * Fresh implementation (no Manim / no Sketch2Motion code) — Node-native, reuses
 * @napi-rs/canvas + system/bundled ffmpeg.
 */
export interface AnimateOptions {
  durationSec?: number; // default 6
  fps?: number; // default 30
  format?: "9:16" | "1:1" | "16:9"; // default 9:16
  strokeWidth?: number; // default 6 (canvas px)
  stroke?: string; // default #111111
  background?: string; // default #ffffff
  holdSec?: number; // freeze on the finished drawing at the end (default 1)
  /**
   * Optional COLORED version of the same page. When set, the line-art is drawn
   * first, then this image fades in ("gets colored") before the hold — so a page
   * the user already colored animates as colored, not just B&W outlines.
   */
  colorImageUrl?: string;
  colorizeSec?: number; // fade-in duration for the colored image (default 0.9)
}

const DIMS: Record<NonNullable<AnimateOptions["format"]>, [number, number]> = {
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
  "16:9": [1920, 1080],
};

function tracePng(png: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    // threshold + turdSize drop tiny speckles; optCurve keeps curves smooth.
    trace(png, { threshold: 128, turdSize: 2, optCurve: true, alphaMax: 1 }, (err, svg) =>
      err ? reject(err) : resolve(svg),
    );
  });
}

function parseSvg(svg: string): { paths: string[]; w: number; h: number } {
  let w = 0;
  let h = 0;
  const vb = svg.match(/viewBox="([-\d.\s]+)"/);
  if (vb) {
    const p = vb[1].trim().split(/\s+/).map(Number);
    w = p[2];
    h = p[3];
  }
  if (!w) w = Number(svg.match(/width="(\d+)/)?.[1] ?? 0);
  if (!h) h = Number(svg.match(/height="(\d+)/)?.[1] ?? 0);
  const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
  return { paths, w: w || 1000, h: h || 1000 };
}

export async function animatePage(imageUrl: string, opts: AnimateOptions = {}): Promise<Buffer> {
  const durationSec = Math.max(1, opts.durationSec ?? 6);
  const fps = Math.max(1, Math.min(60, opts.fps ?? 30));
  const [W, H] = DIMS[opts.format ?? "9:16"];
  // Sketch pass = thin, light pencil; it's replaced by the crisp raster "ink".
  const strokeWidth = opts.strokeWidth ?? 2.5;
  const stroke = opts.stroke ?? "#b9bdc4";
  const background = opts.background ?? "#ffffff";
  const holdSec = opts.holdSec ?? 1;

  // 1. download the line-art
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`fetch image failed (${res.status}): ${imageUrl}`);
  const png = Buffer.from(await res.arrayBuffer());

  // 2. vectorize → paths (used only for the SKETCH motion), and keep the crisp
  //    raster line-art to "ink" over the sketch (exact art, no doubled outlines).
  const svg = await tracePng(png);
  const { paths, w: svgW, h: svgH } = parseSvg(svg);
  if (!paths.length) throw new Error("potrace produced no paths (blank or non-line-art image?)");
  const lineImg = await loadImage(png);

  // fit the drawing into the frame (contain, centered, small margin)
  const margin = 0.08;
  const scale = Math.min((W * (1 - 2 * margin)) / svgW, (H * (1 - 2 * margin)) / svgH);
  const offX = (W - svgW * scale) / 2;
  const offY = (H - svgH * scale) / 2;

  // 3. Split every <path> into its individual closed SUBPATHS. potrace emits ~1
  //    path with many absolute "M …" subpaths; treating the whole `d` as one
  //    polyline made the pen draw a straight line JUMPING between shapes. Each
  //    subpath is ONE closed shape — we sample + draw them independently so the
  //    pen finishes a shape, then moves to the next (no connecting lines).
  const shapes = paths.flatMap((d) => d.split(/(?=M)/).map((s) => s.trim()).filter(Boolean));
  const stepSvg = 1.5 / scale; // ~1.5 canvas px between samples
  const polylines = shapes
    .map((d) => {
      const p = new svgPathProperties(d);
      const len = p.getTotalLength();
      const pts: { x: number; y: number }[] = [];
      for (let l = 0; l <= len; l += stepSvg) pts.push(p.getPointAtLength(l));
      pts.push(p.getPointAtLength(len));
      return pts;
    })
    .filter((pts) => pts.length >= 2);
  // Draw shapes top-to-bottom for a natural build-up order.
  const minY = (pts: { x: number; y: number }[]) => pts.reduce((m, p) => (p.y < m ? p.y : m), Infinity);
  polylines.sort((a, b) => minY(a) - minY(b));
  const lens = polylines.map((pts) => pts.length);
  const totalLen = lens.reduce((s, n) => s + n, 0) || 1;
  const slices: { start: number; end: number }[] = [];
  let acc = 0;
  for (const n of lens) {
    slices.push({ start: acc / totalLen, end: (acc + n) / totalLen });
    acc += n;
  }

  // Optional colored raster to reveal after the line-art is drawn. Fit it with
  // the SAME contain math so it lines up with the traced strokes (same page).
  let colored: Awaited<ReturnType<typeof loadImage>> | null = null;
  let colFit = { scale: 1, offX: 0, offY: 0, w: 0, h: 0 };
  if (opts.colorImageUrl) {
    const cRes = await fetch(opts.colorImageUrl);
    if (cRes.ok) {
      colored = await loadImage(Buffer.from(await cRes.arrayBuffer()));
      const cScale = Math.min((W * (1 - 2 * margin)) / colored.width, (H * (1 - 2 * margin)) / colored.height);
      colFit = {
        scale: cScale,
        offX: (W - colored.width * cScale) / 2,
        offY: (H - colored.height * cScale) / 2,
        w: colored.width * cScale,
        h: colored.height * cScale,
      };
    }
  }

  const drawFrames = Math.round(durationSec * fps);
  const colorizeFrames = colored ? Math.round((opts.colorizeSec ?? 0.9) * fps) : 0;
  const holdFrames = Math.round(holdSec * fps);
  const totalFrames = drawFrames + colorizeFrames + holdFrames;

  // 4. ffmpeg: consume raw RGBA frames from stdin → MP4 on stdout.
  // Prefer an explicit path, then the bundled static binary IF it was actually
  // downloaded (ffmpeg-static's postinstall may be disabled), else system ffmpeg.
  const ffmpegBin =
    process.env.FFMPEG_PATH ||
    (ffmpegStatic && existsSync(ffmpegStatic as string) ? (ffmpegStatic as string) : "ffmpeg");
  const ff = spawn(ffmpegBin, [
    "-y",
    "-f", "rawvideo",
    "-pixel_format", "rgba",
    "-video_size", `${W}x${H}`,
    "-framerate", String(fps),
    "-i", "pipe:0",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-movflags", "frag_keyframe+empty_moov+faststart",
    "-f", "mp4",
    "pipe:1",
  ]);
  const out: Buffer[] = [];
  ff.stdout.on("data", (c) => out.push(c));
  let ffErr = "";
  ff.stderr.on("data", (c) => { ffErr += c.toString(); if (ffErr.length > 4000) ffErr = ffErr.slice(-4000); });
  const done = new Promise<Buffer>((resolve, reject) => {
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg exit ${code}: ${ffErr.slice(-500)}`))));
  });

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const writeFrame = async () => {
    const buf = Buffer.from(ctx.getImageData(0, 0, W, H).data.buffer);
    if (!ff.stdin.write(buf)) await new Promise<void>((r) => ff.stdin.once("drain", () => r()));
  };

  const lineW = svgW * scale;
  const lineH = svgH * scale;
  // "Ink" the crisp raster over the last INK_FRAC of the draw phase so the messy
  // sketch resolves into the exact line-art (no doubled outlines in the result).
  const INK_FRAC = 0.35;

  for (let f = 0; f < totalFrames; f++) {
    // Drawing progress (0..1) over the draw phase; full (1) afterwards.
    const t = f >= drawFrames ? 1 : drawFrames <= 1 ? 1 : f / (drawFrames - 1);
    // Crisp line-art fade-in (starts at INK_FRAC of draw, full by end of draw).
    const inkAlpha = t < 1 - INK_FRAC ? 0 : Math.min(1, (t - (1 - INK_FRAC)) / INK_FRAC);
    // Colored-image fade-in (0 during draw, 0→1 over colorize, 1 in hold).
    const colorAlpha = !colored
      ? 0
      : f < drawFrames
        ? 0
        : colorizeFrames <= 0
          ? 1
          : Math.min(1, (f - drawFrames + 1) / colorizeFrames);

    ctx.fillStyle = background;
    ctx.fillRect(0, 0, W, H);

    // 1. Pencil SKETCH pass (thin, light) — the drawing motion. Fades out as the
    //    crisp raster inks in, so its transient overlaps never survive.
    if (inkAlpha < 1) {
      ctx.globalAlpha = 1 - inkAlpha;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
      ctx.save();
      ctx.translate(offX, offY);
      ctx.scale(scale, scale);
      for (let i = 0; i < polylines.length; i++) {
        const pts = polylines[i];
        const sl = slices[i];
        const local = sl.end <= sl.start ? 1 : (t - sl.start) / (sl.end - sl.start);
        const prog = Math.max(0, Math.min(1, local));
        if (prog <= 0 || pts.length < 2) continue;
        const upto = Math.max(1, Math.floor(prog * (pts.length - 1)));
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let k = 1; k <= upto; k++) ctx.lineTo(pts[k].x, pts[k].y);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // 2. INK: the exact raster line-art fades in over the sketch.
    if (inkAlpha > 0) {
      ctx.globalAlpha = inkAlpha;
      ctx.drawImage(lineImg, offX, offY, lineW, lineH);
      ctx.globalAlpha = 1;
    }

    // 3. COLOR: reveal the colored page on top (if the user colored it).
    if (colored && colorAlpha > 0) {
      ctx.globalAlpha = colorAlpha;
      ctx.drawImage(colored, colFit.offX, colFit.offY, colFit.w, colFit.h);
      ctx.globalAlpha = 1;
    }

    await writeFrame();
  }
  ff.stdin.end();
  return done;
}
