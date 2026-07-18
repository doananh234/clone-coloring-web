import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { PDFDocument, type PDFImage } from "pdf-lib";
import { getR2Config, createR2Client, uploadToR2, resolveR2Url } from "@vx/server-core/r2";

type ImageItem = { id: string; url: string };

async function embedImage(
  pdfDoc: PDFDocument,
  item: ImageItem,
  errors: string[],
): Promise<PDFImage | null> {
  const fullUrl = resolveR2Url(item.url);
  if (!fullUrl || !fullUrl.startsWith("http")) {
    errors.push(`Skip ${item.id}: invalid URL "${item.url}"`);
    return null;
  }

  try {
    const imgRes = await fetch(fullUrl);
    if (!imgRes.ok) {
      errors.push(`Skip ${item.id}: fetch ${imgRes.status} ${fullUrl}`);
      return null;
    }
    const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
    if (imgBytes.byteLength === 0) {
      errors.push(`Skip ${item.id}: empty body ${fullUrl}`);
      return null;
    }

    // Detect format by magic bytes — content-type from R2 is unreliable.
    const isJpeg = imgBytes[0] === 0xff && imgBytes[1] === 0xd8 && imgBytes[2] === 0xff;
    const isPng =
      imgBytes[0] === 0x89 &&
      imgBytes[1] === 0x50 &&
      imgBytes[2] === 0x4e &&
      imgBytes[3] === 0x47;

    if (isJpeg) return await pdfDoc.embedJpg(imgBytes);
    if (isPng) return await pdfDoc.embedPng(imgBytes);

    errors.push(
      `Skip ${item.id}: unsupported format (magic: ${Array.from(imgBytes.slice(0, 4))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ")}) ${fullUrl}`,
    );
    return null;
  } catch (err) {
    errors.push(`Skip ${item.id}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await params;
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const coloringPages: ImageItem[] = (book.coloringPages as ImageItem[] | null) || [];
    const coverUrl = book.coverUrl || undefined;

    if (coloringPages.length === 0 && !coverUrl) {
      return NextResponse.json({ error: "No pages to include" }, { status: 400 });
    }

    // Build ordered list: cover first (if present), then coloring pages.
    const items: ImageItem[] = [];
    if (coverUrl) items.push({ id: "cover", url: coverUrl });
    items.push(...coloringPages);

    const pdfDoc = await PDFDocument.create();
    const errors: string[] = [];

    for (const item of items) {
      const image = await embedImage(pdfDoc, item, errors);
      if (!image) continue;

      // Page size matches image native dimensions — no scaling, no margins.
      const { width, height } = image;
      const pdfPage = pdfDoc.addPage([width, height]);
      pdfPage.drawImage(image, { x: 0, y: 0, width, height });
    }

    if (pdfDoc.getPageCount() === 0) {
      console.error("[generate-pdf] No pages embedded for book", bookId, errors);
      return NextResponse.json(
        { error: "No pages could be embedded", details: errors },
        { status: 400 },
      );
    }
    if (errors.length > 0) {
      console.warn("[generate-pdf] Partial success for book", bookId, errors);
    }

    const pdfBytes = await pdfDoc.save();

    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);
    const { url: pdfUrl } = await uploadToR2({
      client: r2Client,
      config: r2Config,
      key: `assets/${bookId}/book.pdf`,
      body: Buffer.from(pdfBytes),
      contentType: "application/pdf",
    });

    // Cache-bust so the browser doesn't keep serving the previous generation.
    const versionedPdfUrl = `${pdfUrl}?v=${Date.now()}`;
    await prisma.book.update({
      where: { id: bookId },
      data: { pdfUrl: versionedPdfUrl },
    });

    return NextResponse.json({
      success: true,
      pdfUrl: versionedPdfUrl,
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
