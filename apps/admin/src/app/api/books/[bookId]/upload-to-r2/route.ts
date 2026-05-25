import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getR2Config, createR2Client, uploadToR2, resolveR2Url } from "@/lib/r2";
import { FieldValue } from "firebase-admin/firestore";

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;

  try {
    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);

    const doc = await adminDb.collection("books").doc(bookId).get();
    if (!doc.exists) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }
    const book = doc.data()!;

    const results: { field: string; url: string }[] = [];
    const errors: string[] = [];
    const updates: Record<string, unknown> = {};

    // Upload cover
    if (book.coverUrl) {
      const sourceUrl = resolveR2Url(book.coverUrl);
      const buffer = await downloadImage(sourceUrl);
      if (buffer) {
        const ext = book.coverUrl.split(".").pop() || "jpg";
        const key = `assets/${bookId}/cover.${ext}`;
        const { url } = await uploadToR2({
          client: r2Client,
          config: r2Config,
          key,
          body: buffer,
        });
        updates.coverUrl = key;
        results.push({ field: "coverUrl", url });
      } else {
        errors.push("coverUrl: download failed");
      }
    }

    // Upload coloring pages
    if (book.coloringPages?.length) {
      const updatedPages = [];
      for (let i = 0; i < book.coloringPages.length; i++) {
        const page = book.coloringPages[i];
        if (!page.url) {
          updatedPages.push(page);
          continue;
        }

        const sourceUrl = resolveR2Url(page.url);
        const buffer = await downloadImage(sourceUrl);
        if (buffer) {
          const ext = page.url.split(".").pop()?.split("?")[0] || "jpg";
          const key = `assets/${bookId}/pages/page-${String(i + 1).padStart(3, "0")}.${ext}`;
          const { url } = await uploadToR2({
            client: r2Client,
            config: r2Config,
            key,
            body: buffer,
          });
          updatedPages.push({ ...page, url: key });
          results.push({ field: `coloringPages[${i}]`, url });
        } else {
          updatedPages.push(page);
          errors.push(`coloringPages[${i}]: download failed`);
        }
      }
      updates.coloringPages = updatedPages;
    }

    // Update Firestore with new R2 keys
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = FieldValue.serverTimestamp();
      await adminDb.collection("books").doc(bookId).update(updates);
    }

    return NextResponse.json({
      success: true,
      bookId,
      uploaded: results.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
