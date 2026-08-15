import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { getR2Config, createR2Client, uploadToR2, resolveR2Url } from "@vx/server-core/r2";
import { renderPdfToImages } from "@vx/server-core/pdf-renderer";
import type { CloneJob, CloneJobPage } from "@vx/server-core/ai/clone-types";
import { cloneQueue } from "@/lib/queue/clone-queue";

type UploadMode = "one-shot" | "multi-step";

// Next.js App Router: long timeout for large PDF processing
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 1000);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    // Summary (grouped counts) is a separate concern — the list hook passes
    // `counts=0` so paginating / switching tabs doesn't recompute it, and a
    // dedicated counts request drives the tab badges without flashing empty.
    const wantCounts = url.searchParams.get("counts") !== "0";

    const where = status && status !== "all" ? { status } : undefined;

    // Terminal states are sorted by when they became terminal (updatedAt), so
    // the latest finish/failure is visible at the top. Non-terminal states
    // keep createdAt ordering to reflect queue arrival order.
    const isTerminal = status === "reproduced" || status === "error";
    const orderBy = isTerminal
      ? ({ updatedAt: "desc" } as const)
      : ({ createdAt: "desc" } as const);

    const [rows, grouped] = await Promise.all([
      prisma.cloneJob.findMany({
        where,
        orderBy,
        // List rows never use these heavy Json columns (pages = per-page image
        // data, the bulk of a row) — omit them to cut DB transfer + memory.
        omit: { pages: true, bookData: true },
        skip: (page - 1) * limit,
        take: limit,
      }),
      wantCounts
        ? prisma.cloneJob.groupBy({ by: ["status"], _count: { _all: true } })
        : Promise.resolve([] as { status: string; _count: { _all: number } }[]),
    ]);

    const counts: Record<string, number> = { all: 0 };
    for (const g of grouped) {
      counts[g.status] = g._count._all;
      counts.all += g._count._all;
    }

    const jobs = rows.map((row) => {
      const extra = (row.data as any) || {};
      return {
        id: row.id,
        name: row.name,
        status: row.status,
        totalPages: row.totalPages,
        analyzedPages: row.analyzedPages,
        bookId: row.bookId || null,
        sourceBookId: extra.sourceBookId ?? null,
        currentStep: extra.currentStep ?? null,
        failedStep: extra.failedStep ?? null,
        // Surface the failure reason in the list (badge tooltip / inline note),
        // not just on the detail screen.
        error: row.error ?? null,
        retryHistory: extra.retryHistory ?? [],
        thumbnailUrl: extra.thumbnailUrl ?? null,
        brand: extra.brand ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });

    return NextResponse.json({ success: true, data: jobs, counts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let jobId: string;
    let jobName: string;
    let pdfBuffer: Buffer;
    let pdfKey: string;
    let sourceFileName: string;
    let mode: UploadMode = "one-shot";
    let brand: string | null = null;
    let brandId: string | null = null;

    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);

    if (contentType.includes("application/json")) {
      // --- Presigned upload flow: PDF already in R2 ---
      const body = await req.json();
      jobId = body.jobId;
      pdfKey = body.key;
      jobName = body.name || "Untitled";
      sourceFileName = body.fileName || "source.pdf";
      if (body.mode === "multi-step" || body.mode === "one-shot") mode = body.mode;
      if (typeof body.brand === "string" && body.brand.trim()) brand = body.brand.trim();
      if (typeof body.brandId === "string" && body.brandId.trim()) brandId = body.brandId.trim();

      if (!jobId || !pdfKey) {
        return NextResponse.json({ error: "jobId and key required" }, { status: 400 });
      }

      // Only need the PDF bytes if we're going to render pages here.
      if (mode === "multi-step") {
        const pdfUrl = resolveR2Url(`/${pdfKey}`);
        const pdfRes = await fetch(pdfUrl);
        if (!pdfRes.ok) {
          return NextResponse.json(
            { error: "Failed to fetch uploaded PDF from storage" },
            { status: 400 },
          );
        }
        pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
      } else {
        pdfBuffer = Buffer.alloc(0);
      }
    } else {
      // --- Legacy FormData flow (for local dev / small files) ---
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const name = (formData.get("name") as string) || "";
      const modeField = (formData.get("mode") as string) || "";
      if (modeField === "multi-step" || modeField === "one-shot") mode = modeField;
      const brandField = (formData.get("brand") as string) || "";
      if (brandField.trim()) brand = brandField.trim();
      const brandIdField = (formData.get("brandId") as string) || "";
      if (brandIdField.trim()) brandId = brandIdField.trim();

      if (!file) {
        return NextResponse.json({ error: "PDF file required" }, { status: 400 });
      }
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        return NextResponse.json({ error: "File must be a PDF" }, { status: 400 });
      }

      jobId = crypto.randomUUID();
      jobName = name || file.name.replace(/\.pdf$/i, "");
      sourceFileName = file.name;
      pdfBuffer = Buffer.from(await file.arrayBuffer());
      pdfKey = `assets/clone-jobs/${jobId}/source.pdf`;

      await uploadToR2({
        client: r2Client,
        config: r2Config,
        key: pdfKey,
        body: pdfBuffer,
        contentType: "application/pdf",
      });
    }

    const now = new Date().toISOString();

    // Mirror the CSV-import lineage: SourceBook + CloneJob get DIFFERENT ids,
    // CloneJob.data carries denormalized fields for the list view.
    const sourceBookId = crypto.randomUUID();
    await prisma.sourceBook.create({
      data: {
        id: sourceBookId,
        fileName: sourceFileName,
        fileSize: pdfBuffer.byteLength ? String(pdfBuffer.byteLength) : null,
        bookUrl: `/${pdfKey}`,
        topicName: jobName,
        importedFromCsv: null,
        data: { sourcePdfUrl: `/${pdfKey}` } as never,
      },
    });
    const cloneJobData = {
      sourceBookId,
      thumbnailUrl: null as string | null,
      brand,
      brandId,
    };

    if (mode === "one-shot") {
      // One-shot: skip render — worker's stepOneShot ingests the PDF directly.
      // Job is queued immediately; pages are populated once Diaflow returns.
      await prisma.cloneJob.create({
        data: {
          id: jobId,
          name: jobName,
          status: "queued",
          sourceFileName,
          sourcePdfUrl: `/${pdfKey}`,
          totalPages: 0,
          analyzedPages: 0,
          pages: [] as never,
          data: cloneJobData as never,
        },
      });

      await cloneQueue.add("process", { cloneJobId: jobId }, { jobId });

      const job: CloneJob = {
        id: jobId,
        name: jobName,
        status: "queued",
        sourceFileName,
        sourcePdfUrl: `/${pdfKey}`,
        totalPages: 0,
        analyzedPages: 0,
        pages: [],
        createdAt: now,
        updatedAt: now,
      };
      return NextResponse.json({ success: true, job, mode });
    }

    // Multi-step: pre-render pages here, mark useMultiStep=true so the worker
    // takes the legacy render→analyze→reproduce path when the user hits Start.
    const arrayBuffer = pdfBuffer.buffer.slice(
      pdfBuffer.byteOffset,
      pdfBuffer.byteOffset + pdfBuffer.byteLength,
    ) as ArrayBuffer;
    const renderedPages = await renderPdfToImages(arrayBuffer);

    const pages: CloneJobPage[] = [];
    for (const rendered of renderedPages) {
      const pageKey = `assets/clone-jobs/${jobId}/pages/page-${String(rendered.pageNumber).padStart(3, "0")}.png`;
      await uploadToR2({
        client: r2Client,
        config: r2Config,
        key: pageKey,
        body: rendered.pngBuffer,
        contentType: "image/png",
      });

      pages.push({
        pageNumber: rendered.pageNumber,
        imageUrl: `/${pageKey}`,
        status: "pending",
      });
    }

    const job: CloneJob = {
      id: jobId,
      name: jobName,
      status: "extracted",
      sourceFileName,
      sourcePdfUrl: `/${pdfKey}`,
      totalPages: pages.length,
      analyzedPages: 0,
      pages,
      createdAt: now,
      updatedAt: now,
    };

    await prisma.cloneJob.create({
      data: {
        id: jobId,
        name: jobName,
        status: "extracted",
        sourceFileName,
        sourcePdfUrl: `/${pdfKey}`,
        totalPages: pages.length,
        analyzedPages: 0,
        pages: pages as any,
        data: { useMultiStep: true, sourceBookId } as never,
      },
    });

    return NextResponse.json({ success: true, job, mode });
  } catch (error) {
    console.error("[clone/extract] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
