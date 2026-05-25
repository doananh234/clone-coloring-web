import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { PDFDocument } from "pdf-lib";
import { getR2Config, createR2Client, uploadToR2, resolveR2Url } from "@/lib/r2";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await params;
    const bookDoc = await adminDb.collection("books").doc(bookId).get();
    if (!bookDoc.exists) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const book = bookDoc.data()!;
    const pages: { id: string; url: string }[] = book.coloringPages || [];

    if (pages.length === 0) {
      return NextResponse.json({ error: "No coloring pages to include" }, { status: 400 });
    }

    const pdfDoc = await PDFDocument.create();
    const errors: string[] = [];

    for (const page of pages) {
      const fullUrl = resolveR2Url(page.url);
      if (!fullUrl || !fullUrl.startsWith("http")) {
        errors.push(`Skip ${page.id}: invalid URL "${page.url}"`);
        continue;
      }

      try {
        const imgRes = await fetch(fullUrl);
        if (!imgRes.ok) {
          errors.push(`Skip ${page.id}: fetch ${imgRes.status}`);
          continue;
        }
        const imgBytes = new Uint8Array(await imgRes.arrayBuffer());

        const contentType = imgRes.headers.get("content-type") || "";
        let image;
        if (contentType.includes("jpeg") || contentType.includes("jpg")) {
          image = await pdfDoc.embedJpg(imgBytes);
        } else {
          image = await pdfDoc.embedPng(imgBytes);
        }

        // US Letter size: 612 x 792 points (8.5 x 11 inches)
        const pdfPage = pdfDoc.addPage([612, 792]);
        const { width: imgW, height: imgH } = image;

        // Scale to fit with 0.5" margins
        const maxW = 612 - 72;
        const maxH = 792 - 72;
        const scale = Math.min(maxW / imgW, maxH / imgH);
        const drawW = imgW * scale;
        const drawH = imgH * scale;

        pdfPage.drawImage(image, {
          x: (612 - drawW) / 2,
          y: (792 - drawH) / 2,
          width: drawW,
          height: drawH,
        });
      } catch (err) {
        errors.push(`Skip ${page.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (pdfDoc.getPageCount() === 0) {
      return NextResponse.json(
        { error: "No pages could be embedded", details: errors },
        { status: 400 },
      );
    }

    const pdfBytes = await pdfDoc.save();

    // Upload to R2
    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);
    const { url: pdfUrl } = await uploadToR2({
      client: r2Client,
      config: r2Config,
      key: `assets/${bookId}/book.pdf`,
      body: Buffer.from(pdfBytes),
      contentType: "application/pdf",
    });

    // Update book
    await adminDb.collection("books").doc(bookId).update({
      pdfUrl,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      pdfUrl,
      pageCount: pdfDoc.getPageCount(),
      ...(errors.length > 0 ? { warnings: errors } : {}),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
