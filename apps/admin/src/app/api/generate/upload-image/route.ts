import { NextRequest, NextResponse } from "next/server";
import { getR2Config, createR2Client, uploadToR2 } from "@/lib/r2";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { base64, key } = body as { base64: string; key: string };

    if (!base64 || !key) {
      return NextResponse.json({ error: "base64 and key are required" }, { status: 400 });
    }

    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);

    // Strip data URL prefix if present
    const raw = base64.includes(",") ? base64.split(",")[1] : base64;
    const buffer = Buffer.from(raw, "base64");

    const { url } = await uploadToR2({
      client: r2Client,
      config: r2Config,
      key,
      body: buffer,
      contentType: "image/png",
    });

    return NextResponse.json({ success: true, url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
