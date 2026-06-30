import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { getR2Config, createR2Client, resolveR2Url } from "@vx/server-core/r2";
import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import type { CloneJob, CloneJobPage } from "@vx/server-core/ai/clone-types";

type RouteParams = { params: Promise<{ jobId: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;
    const row = await prisma.cloneJob.findUnique({ where: { id: jobId } });

    if (!row) {
      return NextResponse.json({ error: "Clone job not found" }, { status: 404 });
    }

    const extra = (row.data as any) || {};
    const pages = (row.pages as CloneJobPage[]) || [];

    // Resolve R2 URLs for client display
    const resolvedPages = pages.map((p) => ({
      ...p,
      imageUrl: resolveR2Url(p.imageUrl),
      redesignedUrl: p.redesignedUrl ? resolveR2Url(p.redesignedUrl) : undefined,
    }));

    const job: CloneJob = {
      id: row.id,
      name: row.name,
      status: row.status as CloneJob["status"],
      sourceFileName: row.sourceFileName || "",
      sourcePdfUrl: row.sourcePdfUrl || "",
      totalPages: row.totalPages,
      analyzedPages: row.analyzedPages,
      pages,
      bookData: (row.bookData as any) ?? undefined,
      entityMap: (row.entityMap as any) ?? undefined,
      bookId: row.bookId ?? undefined,
      resultBookId: row.resultBookId ?? undefined,
      error: row.error ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      ...extra,
    };

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
    const row = await prisma.cloneJob.findUnique({ where: { id: jobId } });

    if (!row) {
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

    // Delete Postgres row
    await prisma.cloneJob.delete({ where: { id: jobId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[clone/delete] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
