import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getR2Config, createR2Client, uploadToR2, resolveR2Url } from "@/lib/r2";
import { renderPdfToImages } from "@/lib/pdf-renderer";
import type { CloneJob, CloneJobPage } from "@/lib/ai/clone-types";

// Next.js App Router: long timeout for large PDF processing
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snap = await adminDb
      .collection("cloneJobs")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const jobs = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        status: data.status,
        totalPages: data.totalPages,
        analyzedPages: data.analyzedPages,
        bookId: data.bookId || null,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    });

    return NextResponse.json({ success: true, data: jobs });
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

    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);

    if (contentType.includes("application/json")) {
      // --- Presigned upload flow: PDF already in R2 ---
      const body = await req.json();
      jobId = body.jobId;
      pdfKey = body.key;
      jobName = body.name || "Untitled";
      sourceFileName = body.fileName || "source.pdf";

      if (!jobId || !pdfKey) {
        return NextResponse.json({ error: "jobId and key required" }, { status: 400 });
      }

      // Fetch PDF from R2
      const pdfUrl = resolveR2Url(`/${pdfKey}`);
      const pdfRes = await fetch(pdfUrl);
      if (!pdfRes.ok) {
        return NextResponse.json({ error: "Failed to fetch uploaded PDF from storage" }, { status: 400 });
      }
      pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
    } else {
      // --- Legacy FormData flow (for local dev / small files) ---
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const name = (formData.get("name") as string) || "";

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

    // Render PDF pages to PNG images
    const arrayBuffer = pdfBuffer.buffer.slice(
      pdfBuffer.byteOffset,
      pdfBuffer.byteOffset + pdfBuffer.byteLength,
    ) as ArrayBuffer;
    const renderedPages = await renderPdfToImages(arrayBuffer);

    // Upload each page image to R2
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

    // Create clone job in Firestore
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

    await adminDb.collection("cloneJobs").doc(jobId).set(job);

    return NextResponse.json({ success: true, job });
  } catch (error) {
    console.error("[clone/extract] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
