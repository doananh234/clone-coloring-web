import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { PDFDocument, PDFImage } from "pdf-lib";
import {
  R2Config,
  createR2Client,
  getR2Config,
  resolveR2Url,
  uploadToR2,
} from "@/lib/r2";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const FETCH_TIMEOUT_MS = 60_000;
// 8.5" × 8.5" square page (72pt/inch) — matches the square coloring-page art.
const PAGE_SIZE = 612;
// Full-bleed: image fills page edge-to-edge, like a printed book.
const MARGIN = 0;

type FetchedImage = {
  id: string;
  bytes: Uint8Array;
  contentType: string;
  url: string;
};

async function fetchViaHttp(
  url: string,
): Promise<{ bytes: Uint8Array; contentType: string } | { error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return { error: `fetch ${res.status}` };
    const bytes = new Uint8Array(await res.arrayBuffer());
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    return { bytes, contentType };
  } catch (err) {
    return { error: `fetch failed: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchViaS3(
  client: S3Client,
  config: R2Config,
  key: string,
): Promise<{ bytes: Uint8Array; contentType: string } | { error: string }> {
  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    const arrayBuf = await res.Body!.transformToByteArray();
    const bytes = new Uint8Array(arrayBuf);
    const contentType = (res.ContentType || "").toLowerCase();
    return { bytes, contentType };
  } catch (err) {
    return { error: `s3 get failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function fetchImage(
  page: { id: string; url?: string },
  s3: { client: S3Client; config: R2Config },
): Promise<FetchedImage | { id: string; error: string }> {
  if (!page.url) {
    return { id: page.id, error: "page has no url (pending?)" };
  }
  const fullUrl = resolveR2Url(page.url);
  const isHttp = fullUrl.startsWith("http://") || fullUrl.startsWith("https://");

  const result = isHttp
    ? await fetchViaHttp(fullUrl)
    : await fetchViaS3(s3.client, s3.config, page.url.replace(/^\//, ""));

  if ("error" in result) return { id: page.id, error: result.error };
  return { id: page.id, bytes: result.bytes, contentType: result.contentType, url: fullUrl };
}

/**
 * Detect image format from magic bytes — header/extension lies (R2 objects
 * are often mislabeled), but the actual file header doesn't.
 */
function detectFormat(bytes: Uint8Array): "jpeg" | "png" | "other" {
  if (bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  return "other";
}

/**
 * Convert any raster image to PNG bytes via @napi-rs/canvas.
 * Handles WebP, GIF (first frame), AVIF, etc. that pdf-lib can't embed natively.
 */
async function convertToPng(bytes: Uint8Array): Promise<Uint8Array> {
  const napiCanvas = await import("@napi-rs/canvas");
  const image = await napiCanvas.loadImage(Buffer.from(bytes));
  const canvas = napiCanvas.createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  return canvas.toBuffer("image/png");
}

async function embedImage(
  pdfDoc: PDFDocument,
  fetched: FetchedImage,
): Promise<PDFImage> {
  const format = detectFormat(fetched.bytes);
  if (format === "jpeg") return pdfDoc.embedJpg(fetched.bytes);
  if (format === "png") return pdfDoc.embedPng(fetched.bytes);
  const pngBytes = await convertToPng(fetched.bytes);
  return pdfDoc.embedPng(pngBytes);
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  try {
    const bookDoc = await adminDb.collection("books").doc(bookId).get();
    if (!bookDoc.exists) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const book = bookDoc.data()!;
    const allPages: { id: string; url?: string }[] = book.coloringPages || [];
    const pages = allPages.filter((p) => typeof p.url === "string" && p.url.length > 0);

    if (pages.length === 0) {
      return NextResponse.json(
        {
          error: "No coloring pages to include",
          details: { total: allPages.length, withUrl: 0 },
        },
        { status: 400 },
      );
    }

    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);

    // First page: book cover (has title/text overlay). Fall back to thumbnails
    // only if no cover is set.
    const coverPick = book.coverUrl
      ? { source: "coverUrl", url: book.coverUrl as string }
      : book.squareThumbnailUrl
        ? { source: "squareThumbnailUrl", url: book.squareThumbnailUrl as string }
        : book.thumbnailUrl
          ? { source: "thumbnailUrl", url: book.thumbnailUrl as string }
          : null;
    console.log(
      `[generate-pdf:${bookId}] cover: ${coverPick ? `${coverPick.source} -> ${coverPick.url}` : "none (no squareThumbnailUrl/thumbnailUrl/coverUrl on book)"}`,
    );
    const coverPage = coverPick ? { id: "__cover__", url: coverPick.url } : null;

    // Parallel fetch — serial was the main timeout cause.
    const fetched = await Promise.all(
      [...(coverPage ? [coverPage] : []), ...pages].map((p) =>
        fetchImage(p, { client: r2Client, config: r2Config }),
      ),
    );

    const pdfDoc = await PDFDocument.create();
    const errors: string[] = [];

    for (const result of fetched) {
      if ("error" in result) {
        const msg = `Skip ${result.id}: ${result.error}`;
        console.error(`[generate-pdf:${bookId}] ${msg}`);
        errors.push(msg);
        continue;
      }
      try {
        const image = await embedImage(pdfDoc, result);
        const pdfPage = pdfDoc.addPage([PAGE_SIZE, PAGE_SIZE]);
        const { width: imgW, height: imgH } = image;
        const maxSide = PAGE_SIZE - MARGIN * 2;
        const scale = Math.min(maxSide / imgW, maxSide / imgH);
        const drawW = imgW * scale;
        const drawH = imgH * scale;
        pdfPage.drawImage(image, {
          x: (PAGE_SIZE - drawW) / 2,
          y: (PAGE_SIZE - drawH) / 2,
          width: drawW,
          height: drawH,
        });
      } catch (err) {
        const msg = `Skip ${result.id}: embed failed: ${err instanceof Error ? err.message : String(err)}`;
        console.error(`[generate-pdf:${bookId}] ${msg}`);
        errors.push(msg);
      }
    }

    if (pdfDoc.getPageCount() === 0) {
      return NextResponse.json(
        { error: "No pages could be embedded", details: errors },
        { status: 400 },
      );
    }

    const pdfBytes = await pdfDoc.save();

    const { url: storedUrl } = await uploadToR2({
      client: r2Client,
      config: r2Config,
      key: `assets/${bookId}/book.pdf`,
      body: Buffer.from(pdfBytes),
      contentType: "application/pdf",
    });
    // Cache-bust so the browser doesn't keep serving the previous generation.
    const pdfUrl = `${storedUrl}?v=${Date.now()}`;

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
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[generate-pdf:${bookId}] fatal:`, error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
