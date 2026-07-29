import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { getR2Config, createR2Client, uploadToR2 } from "@vx/server-core/r2";

const ALLOWED = ["woff2", "ttf", "otf"] as const;
const MAX_BYTES = 2 * 1024 * 1024;
const CONTENT_TYPE: Record<string, string> = { woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf" };

// The /api/fonts write endpoints (POST/DELETE/PATCH) intentionally have no
// per-route auth check. They rely on the same deployment-level / gateway auth
// as the rest of apps/admin/src/app/api/* (e.g. brands, coloring-styles),
// which likewise have none per-route. Adding a per-route check here would be
// inconsistent with the existing admin API surface — do NOT add one.

// Recognized sfnt/woff signatures (first 4 bytes of the decoded buffer).
// Blocks arbitrary non-font blobs from being uploaded even when the client
// declares a valid `format`.
function detectFontSignature(buffer: Buffer): "woff2" | "sfnt" | null {
  if (buffer.byteLength < 4) return null;
  const b0 = buffer[0], b1 = buffer[1], b2 = buffer[2], b3 = buffer[3];
  // "wOF2" — WOFF2
  if (b0 === 0x77 && b1 === 0x4f && b2 === 0x46 && b3 === 0x32) return "woff2";
  // "wOFF" — WOFF1
  if (b0 === 0x77 && b1 === 0x4f && b2 === 0x46 && b3 === 0x46) return "sfnt";
  // "OTTO" — OpenType/CFF
  if (b0 === 0x4f && b1 === 0x54 && b2 === 0x54 && b3 === 0x4f) return "sfnt";
  // 0x00 0x01 0x00 0x00 — TrueType
  if (b0 === 0x00 && b1 === 0x01 && b2 === 0x00 && b3 === 0x00) return "sfnt";
  // "true" — TrueType (Apple)
  if (b0 === 0x74 && b1 === 0x72 && b2 === 0x75 && b3 === 0x65) return "sfnt";
  // "ttcf" — TrueType collection
  if (b0 === 0x74 && b1 === 0x74 && b2 === 0x63 && b3 === 0x66) return "sfnt";
  return null;
}

export async function GET() {
  try {
    const data = await prisma.font.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, base64, format, weight } = body as { name?: string; base64?: string; format?: string; weight?: number };
    if (!name || !base64 || !format) {
      return NextResponse.json({ error: "name, base64 và format là bắt buộc" }, { status: 400 });
    }
    if (!(ALLOWED as readonly string[]).includes(format)) {
      return NextResponse.json({ error: "Chỉ chấp nhận .woff2, .ttf, .otf" }, { status: 400 });
    }
    const raw = base64.includes(",") ? base64.split(",")[1] : base64;
    const buffer = Buffer.from(raw, "base64");
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "File font vượt quá 2MB" }, { status: 400 });
    }
    // Sniff the decoded bytes: reject anything that is not a recognized font
    // signature, and require woff2 declarations to actually be woff2 bytes.
    const signature = detectFontSignature(buffer);
    if (!signature || (format === "woff2" && signature !== "woff2")) {
      return NextResponse.json({ error: "File không phải font hợp lệ" }, { status: 400 });
    }
    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);
    const safe = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "font";
    const key = `fonts/${Date.now()}-${safe}.${format}`;
    const { url } = await uploadToR2({ client: r2Client, config: r2Config, key, body: buffer, contentType: CONTENT_TYPE[format] });
    const font = await prisma.font.create({ data: { name, fileUrl: url, format, weight: typeof weight === "number" ? weight : null } });
    return NextResponse.json({ success: true, font });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
