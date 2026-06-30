import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { getR2Config, createR2Client, uploadToR2, resolveR2Url } from "@vx/server-core/r2";
import { colorizeImage } from "@vx/server-core/ai/image-provider";
import { flushLangfuse } from "@vx/server-core/langfuse";

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

    // Load coloring style from Postgres
    const style = await prisma.coloringStyle.findUnique({ where: { id: coloringStyleId } });
    if (!style) {
      return NextResponse.json({ error: "Coloring style not found" }, { status: 404 });
    }

    if (!style.colorizationDirective) {
      return NextResponse.json(
        { error: "Coloring style has no colorizationDirective" },
        { status: 400 },
      );
    }

    // Colorize the image with style reference images as visual anchor
    const referenceImageUrls = ((style.referenceImages as { url: string }[]) || []).map((r) =>
      resolveR2Url(r.url),
    );
    const img = await colorizeImage(resolveR2Url(imageUrl), style.colorizationDirective, {
      referenceImageUrls,
      trace: { caller: "coloring-styles/colorize" },
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
      const book = await prisma.book.findUnique({ where: { id: bookId } });

      if (book) {
        let coloringPages = (book.coloringPages as any[]) || [];

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
        // Append cache-bust param so value changes even when R2 key is the same
        const coloredUrlWithBust = `${coloredUrl}?v=${Date.now()}`;
        const existingIdx = coloringPages.findIndex((p: PageEntry) => p.id === pageId);

        if (existingIdx >= 0) {
          coloringPages[existingIdx].coloredUrl = coloredUrlWithBust;
          coloringPages[existingIdx].coloringStyleId = coloringStyleId;
        } else {
          console.warn(`[colorize] Page ${pageId} not found in book ${bookId} coloringPages`);
        }

        await prisma.book.update({
          where: { id: bookId },
          data: { coloringPages },
        });
      }
    }

    await flushLangfuse();

    return NextResponse.json({ success: true, coloredUrl });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
