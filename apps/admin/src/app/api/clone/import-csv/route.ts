import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
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

    // Only enqueue rows the operator selected in the sheet (Select=TRUE).
    const selectedRows = rows.filter((r) => r.selectedInCsv);
    const unselected = rows.length - selectedRows.length;

    const newRows: typeof rows = [];
    let skipped = 0;
    for (const row of selectedRows) {
      const existing = await adminDb.collection("sourceBooks").doc(row.id).get();
      if (existing.exists) {
        skipped++;
      } else {
        newRows.push(row);
      }
    }

    if (dryRun) {
      return NextResponse.json({
        imported: newRows.length,
        skipped,
        unselected,
        invalid: invalid.length,
        invalidRows: invalid,
        jobIds: [],
      });
    }

    const jobIds: string[] = [];
    for (const row of newRows) {
      const jobId = crypto.randomUUID();
      const now = new Date().toISOString();
      await adminDb.collection("sourceBooks").doc(row.id).set(row);
      await adminDb.collection("cloneJobs").doc(jobId).set({
        id: jobId,
        name: row.fileName.replace(/\.pdf$/i, "") || row.id,
        status: "queued",
        sourceBookId: row.id,
        sourcePdfUrl: row.sourcePdfUrl,
        sourceFileName: row.fileName,
        totalPages: 0,
        analyzedPages: 0,
        pages: [],
        createdAt: now,
        updatedAt: now,
      });
      jobIds.push(jobId);
    }

    for (const jobId of jobIds) {
      await cloneQueue.add("process", { cloneJobId: jobId }, { jobId });
    }

    return NextResponse.json({
      imported: newRows.length,
      skipped,
      invalid: invalid.length,
      invalidRows: invalid,
      jobIds,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
