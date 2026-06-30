import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { cloneQueue } from "@/lib/queue/clone-queue";
import { parseSourceBooksCsv } from "@/lib/csv/parse-source-books";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dryRun") === "1";

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

    const csvText = await file.text();
    const importedFromCsv = `${file.name}@${new Date().toISOString()}`;
    const { rows, invalid } = parseSourceBooksCsv(csvText, importedFromCsv);

    // Dedupe across ALL rows (not just selected) so Select=FALSE rows still get
    // imported as `pending` and the operator can promote them later.
    const newRows: typeof rows = [];
    let skipped = 0;
    for (const row of rows) {
      const existing = await prisma.sourceBook.findUnique({ where: { id: row.id } });
      if (existing) {
        skipped++;
      } else {
        newRows.push(row);
      }
    }

    const queuedCount = newRows.filter((r) => r.selectedInCsv).length;
    const pendingCount = newRows.length - queuedCount;

    if (dryRun) {
      return NextResponse.json({
        imported: queuedCount,
        pending: pendingCount,
        skipped,
        unselected: 0, // legacy
        invalid: invalid.length,
        invalidRows: invalid,
        jobIds: [],
      });
    }

    const jobIds: string[] = [];
    const pendingJobIds: string[] = [];
    for (const row of newRows) {
      const jobId = crypto.randomUUID();
      const status = row.selectedInCsv ? "queued" : "pending";

      // Map CSV row to SourceBook scalar columns plus catch-all `data`
      const sourceBookData: Record<string, unknown> = { ...row };
      const knownFields = [
        "id",
        "fileName",
        "fileSize",
        "topicName",
        "thumbnailUrl",
        "thumbnailPreview",
        "bookUrl",
        "selected",
        "removed",
        "niche",
        "priority",
        "importedFromCsv",
      ];
      const sourceBookCols: Record<string, unknown> = {};
      const extraSource: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(sourceBookData)) {
        if (knownFields.includes(k)) sourceBookCols[k] = v;
        else extraSource[k] = v;
      }

      await prisma.sourceBook.create({
        data: {
          id: row.id,
          ...sourceBookCols,
          data: extraSource,
        } as any,
      });

      await prisma.cloneJob.create({
        data: {
          id: jobId,
          name: row.fileName.replace(/\.pdf$/i, "") || row.id,
          status,
          sourcePdfUrl: row.sourcePdfUrl,
          sourceFileName: row.fileName,
          totalPages: 0,
          analyzedPages: 0,
          pages: [],
          data: {
            sourceBookId: row.id,
            // Denormalize for fast UI rendering without a second read.
            thumbnailUrl: row.thumbnailUrl || null,
            brand: row.brand || null,
          },
        },
      });
      (row.selectedInCsv ? jobIds : pendingJobIds).push(jobId);
    }

    // Only enqueue the selected ones into BullMQ; pending stay idle.
    for (const jobId of jobIds) {
      await cloneQueue.add("process", { cloneJobId: jobId }, { jobId });
    }

    return NextResponse.json({
      imported: jobIds.length,
      pending: pendingJobIds.length,
      skipped,
      unselected: 0,
      invalid: invalid.length,
      invalidRows: invalid,
      jobIds,
      pendingJobIds,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
