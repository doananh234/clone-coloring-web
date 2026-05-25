import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { getR2Config, createR2Client, uploadToR2, resolveR2Url } from "@/lib/r2";
import { colorizeImage } from "@/lib/ai/image-provider";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageUrl, coloringStyleId, bookId, pageId } = body as {
      imageUrl: string;
      coloringStyleId: string;
      bookId?: string;
      pageId?: string;
    };

    if (!imageUrl) {
      return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
    }
    if (!coloringStyleId) {
      return NextResponse.json({ error: "coloringStyleId is required" }, { status: 400 });
    }

    // Load coloring style from Firestore
    const styleDoc = await adminDb.collection("coloringStyles").doc(coloringStyleId).get();
    if (!styleDoc.exists) {
      return NextResponse.json({ error: "Coloring style not found" }, { status: 404 });
    }
    const style = styleDoc.data()!;

    if (!style.colorizationDirective) {
      return NextResponse.json(
        { error: "Coloring style has no colorizationDirective" },
        { status: 400 },
      );
    }

    // Colorize the image with style reference images as visual anchor
    const referenceImageUrls = (style.referenceImages || []).map((r: { url: string }) =>
      resolveR2Url(r.url),
    );
    const img = await colorizeImage(resolveR2Url(imageUrl), style.colorizationDirective, {
      referenceImageUrls,
    });

    // Upload colored result to R2
    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);

    const base64 = img.dataUrl.split(",")[1];
    const buffer = Buffer.from(base64, "base64");

    let key: string;
    if (bookId && pageId) {
      key = `assets/${bookId}/pages/${pageId}-colored.png`;
    } else {
      key = `assets/coloring-styles/${coloringStyleId}/test-${Date.now()}.png`;
    }

    const { url: coloredUrl } = await uploadToR2({
      client: r2Client,
      config: r2Config,
      key,
      body: buffer,
      contentType: "image/png",
    });

    // If bookId+pageId, update the matching entry in book's coloringPages array
    if (bookId && pageId) {
      const bookRef = adminDb.collection("books").doc(bookId);
      const bookDoc = await bookRef.get();

      if (bookDoc.exists) {
        const bookData = bookDoc.data()!;
        let coloringPages = bookData.coloringPages || [];

        // Migrate legacy orphan entries: merge {pageId, coloredUrl} back into real pages
        type PageEntry = {
          id?: string;
          pageId?: string;
          url?: string;
          coloredUrl?: string;
          coloringStyleId?: string;
          [k: string]: unknown;
        };
        const orphans = (coloringPages as PageEntry[]).filter(
          (p) => !p.url && p.pageId && p.coloredUrl,
        );
        if (orphans.length > 0) {
          const orphanMap = new Map(orphans.map((o) => [o.pageId!, o]));
          coloringPages = (coloringPages as PageEntry[])
            .filter((p) => p.id && p.url) // keep only real pages
            .map((p) => {
              const orphan = orphanMap.get(p.id!);
              if (orphan && !p.coloredUrl) {
                return {
                  ...p,
                  coloredUrl: orphan.coloredUrl,
                  coloringStyleId: orphan.coloringStyleId,
                };
              }
              return p;
            });
        }

        // Find existing entry by `id` and set coloredUrl
        const existingIdx = coloringPages.findIndex((p: PageEntry) => p.id === pageId);

        if (existingIdx >= 0) {
          coloringPages[existingIdx].coloredUrl = coloredUrl;
          coloringPages[existingIdx].coloringStyleId = coloringStyleId;
        }

        await bookRef.update({
          coloringPages,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    return NextResponse.json({ success: true, coloredUrl });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
