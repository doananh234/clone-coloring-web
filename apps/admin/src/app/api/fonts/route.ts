import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { getR2Config, createR2Client, uploadToR2 } from "@vx/server-core/r2";

const ALLOWED = ["woff2", "ttf", "otf"] as const;
const MAX_BYTES = 2 * 1024 * 1024;
const CONTENT_TYPE: Record<string, string> = { woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf" };

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
