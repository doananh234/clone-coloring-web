import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { getR2Config, createR2Client, uploadToR2, resolveR2Url } from "@vx/server-core/r2";
import { colorizeImage } from "@vx/server-core/ai/image-provider";
import { flushLangfuse } from "@vx/server-core/langfuse";
import { upsertColoredSourceCover, type SourceCover } from "@vx/coloring/data/source-covers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageUrl, coloringStyleId, coloringVariantId, bookId, pageId, useReference = true, target = "page", provider: providerRaw } = body as {
      imageUrl: string;
      coloringStyleId: string;
      provider?: string;
      /** Optional color variant within the style — its palette/directive/reference
       *  override the style-level defaults so the exact chosen colors are used. */
      coloringVariantId?: string;
      bookId?: string;
      pageId?: string;
      /** When true (default), the style's colored reference images are sent as a
       *  visual anchor alongside the directive. When false, colorize from the
       *  directive text only (prompt-only mode). */
      useReference?: boolean;
      target?: "page" | "sourceCover";
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

    // Resolve the chosen variant (if any) — its directive + reference thumbnail
    // override the style-level defaults so the exact selected colors are applied.
    type Variant = { id?: string; colorizationDirective?: string; thumbnailUrl?: string };
    const variant = coloringVariantId
      ? ((style.variants as Variant[] | null) || []).find((v) => v?.id === coloringVariantId)
      : undefined;

    const directive = (variant?.colorizationDirective || style.colorizationDirective || "").trim();
    if (!directive) {
      return NextResponse.json(
        { error: "Coloring style/variant has no colorizationDirective" },
        { status: 400 },
      );
    }

    // Colorize with reference image(s) as visual anchor: the variant's own source
    // thumbnail when a variant is chosen, else the style's reference images.
    // Prompt-only mode (useReference=false) relies on the directive text alone.
    const styleRefs = ((style.referenceImages as { url: string }[]) || []).map((r) => resolveR2Url(r.url));
    const referenceImageUrls = useReference
      ? variant?.thumbnailUrl
        ? [resolveR2Url(variant.thumbnailUrl)]
        : styleRefs
      : [];
    const provider = providerRaw === "kingcong" || providerRaw === "diaflow" ? providerRaw : undefined;
    const img = await colorizeImage(resolveR2Url(imageUrl), directive, {
      referenceImageUrls,
      provider,
      trace: { caller: "coloring-styles/colorize" },
    });

    // Upload colored result to R2
    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);

    const base64 = img.dataUrl.split(",")[1];
    const buffer = Buffer.from(base64, "base64");

    let key: string;
    if (bookId && pageId) {
      key = target === "sourceCover"
        ? `assets/${bookId}/source-covers/${pageId}-colored.png`
        : `assets/${bookId}/pages/${pageId}-colored.png`;
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
        const coloredUrlWithBust = `${coloredUrl}?v=${Date.now()}`;
        if (target === "sourceCover") {
          const data = (book.data as Record<string, unknown> | null) ?? {};
          const sourceCovers = upsertColoredSourceCover(
            (data.sourceCovers as SourceCover[] | undefined) ?? [],
            pageId, coloredUrlWithBust, coloringStyleId, coloringVariantId ?? null,
          );
          await prisma.book.update({ where: { id: bookId }, data: { data: { ...data, sourceCovers } as never } });
        } else {
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
          const existingIdx = coloringPages.findIndex((p: PageEntry) => p.id === pageId);

          if (existingIdx >= 0) {
            coloringPages[existingIdx].coloredUrl = coloredUrlWithBust;
            coloringPages[existingIdx].coloringStyleId = coloringStyleId;
            coloringPages[existingIdx].coloringVariantId = coloringVariantId ?? null;
            // D4b: keep the selected variant's coloredUrl in sync so switching
            // variants doesn't lose the colored result.
            const sel = coloringPages[existingIdx].selectedVariantId as string | undefined;
            const variants = coloringPages[existingIdx].variants as { id: string; coloredUrl?: string }[] | undefined;
            if (sel && Array.isArray(variants)) {
              const vIdx = variants.findIndex((v) => v.id === sel);
              if (vIdx >= 0) variants[vIdx].coloredUrl = coloredUrlWithBust;
            }
          } else {
            console.warn(`[colorize] Page ${pageId} not found in book ${bookId} coloringPages`);
          }

          await prisma.book.update({
            where: { id: bookId },
            data: { coloringPages },
          });
        }
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
