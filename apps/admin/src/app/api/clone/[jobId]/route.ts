import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getR2Config, createR2Client, resolveR2Url } from "@/lib/r2";
import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import type { CloneJob } from "@/lib/ai/clone-types";

type RouteParams = { params: Promise<{ jobId: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;
    const doc = await adminDb.collection("cloneJobs").doc(jobId).get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Clone job not found" }, { status: 404 });
    }

    const job = doc.data() as CloneJob;

    // Resolve R2 URLs for client display
    const resolvedPages = job.pages.map((p) => ({
      ...p,
      imageUrl: resolveR2Url(p.imageUrl),
    }));

    return NextResponse.json({
      success: true,
      job: { ...job, pages: resolvedPages },
    });
  } catch (error) {
    console.error("[clone/get] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;
    const doc = await adminDb.collection("cloneJobs").doc(jobId).get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Clone job not found" }, { status: 404 });
    }

    // Cleanup R2 assets
    try {
      const r2Config = getR2Config();
      const r2Client = createR2Client(r2Config);
      const prefix = `assets/clone-jobs/${jobId}/`;

      const listResult = await r2Client.send(
        new ListObjectsV2Command({
          Bucket: r2Config.bucket,
          Prefix: prefix,
        }),
      );

      if (listResult.Contents && listResult.Contents.length > 0) {
        await r2Client.send(
          new DeleteObjectsCommand({
            Bucket: r2Config.bucket,
            Delete: {
              Objects: listResult.Contents.map((obj) => ({ Key: obj.Key })),
            },
          }),
        );
      }
    } catch (r2Error) {
      console.warn("[clone/delete] R2 cleanup failed (non-fatal):", r2Error);
    }

    // Delete Firestore document
    await adminDb.collection("cloneJobs").doc(jobId).delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[clone/delete] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
