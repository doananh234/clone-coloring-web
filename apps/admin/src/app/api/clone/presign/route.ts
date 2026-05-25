import { NextRequest, NextResponse } from "next/server";
import { getR2Config, createR2Client, getPresignedUploadUrl } from "@/lib/r2";

export async function POST(req: NextRequest) {
  try {
    const { fileName } = await req.json();
    if (!fileName || !String(fileName).toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "PDF filename required" }, { status: 400 });
    }

    const jobId = crypto.randomUUID();
    const key = `assets/clone-jobs/${jobId}/source.pdf`;

    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);

    const { uploadUrl } = await getPresignedUploadUrl({
      client: r2Client,
      config: r2Config,
      key,
      contentType: "application/pdf",
      expiresIn: 3600,
    });

    return NextResponse.json({ uploadUrl, jobId, key });
  } catch (error) {
    console.error("[clone/presign] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
