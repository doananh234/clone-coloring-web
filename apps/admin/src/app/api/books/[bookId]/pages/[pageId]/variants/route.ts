import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@vx/db";
import { editImage } from "@vx/server-core/ai";
import { buildRedesignPrompt } from "@vx/server-core/ai/prompts";
import { getR2Config, createR2Client, uploadToR2, resolveR2Url } from "@vx/server-core/r2";
import { flushLangfuse } from "@vx/server-core/langfuse";
import { ensureOriginalVariant, addVariants, selectVariant, type PageVariant } from "@vx/coloring/data/page-variants";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ bookId: string; pageId: string }> };

/** Regen Thêm: generate `count` non-destructive variants for one page. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId, pageId } = await params;
    const body = (await req.json().catch(() => ({}))) as { count?: number; source?: "A" | "B"; changePercent?: number };
    const count = Math.min(4, Math.max(1, body.count ?? 1));
    const source: "A" | "B" = body.source === "B" ? "B" : "A";
    const pct = Math.min(95, Math.max(5, body.changePercent ?? 30));

    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
    const pages = (book.coloringPages as any[]) || [];
    const idx = pages.findIndex((p) => p.id === pageId);
    if (idx === -1) return NextResponse.json({ error: "Page not found" }, { status: 404 });

    const now = new Date().toISOString();
    const seeded = ensureOriginalVariant(pages[idx], () => crypto.randomUUID(), now);
    let page = seeded.page;
    const anchor = (page.variants ?? []).find((v: PageVariant) => v.id === seeded.originalId)!;
    const anchorUrl = resolveR2Url(anchor.url);

    const originalPrompt = typeof page.prompt === "string" ? page.prompt.trim() : "";
    const useB = source === "B" && originalPrompt.length > 0;
    const prompt = useB
      ? `${buildRedesignPrompt(pct)}\n\nORIGINAL SCENE DESCRIPTION (keep faithful to this):\n${originalPrompt}`
      : buildRedesignPrompt(pct);

    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);
    const created: PageVariant[] = [];
    for (let k = 0; k < count; k++) {
      const img = await editImage(anchorUrl, prompt, {
        trace: { caller: "books/page-variants", entityType: "book", entityId: bookId },
      });
      const base64 = img.base64 || img.dataUrl?.split(",")[1] || "";
      const variantId = crypto.randomUUID();
      const key = `assets/${bookId}/pages/${pageId}-v-${variantId}.png`;
      const { url } = await uploadToR2({ client: r2Client, config: r2Config, key, body: Buffer.from(base64, "base64"), contentType: "image/png" });
      created.push({
        id: variantId, url, origin: "regen",
        source: useB ? "B" : "A",
        ...(useB ? { prompt: originalPrompt } : {}),
        changePercent: pct, createdAt: new Date().toISOString(),
      });
    }

    page = addVariants(page, created);
    pages[idx] = page;
    await prisma.book.update({ where: { id: bookId }, data: { coloringPages: pages as any } });
    await flushLangfuse();
    return NextResponse.json({ success: true, added: created.length });
  } catch (error) {
    console.error("[books/page-variants POST] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

/** Select a variant as the live image (mirrors url/coloredUrl onto the page). */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId, pageId } = await params;
    const body = (await req.json().catch(() => ({}))) as { variantId?: string };
    if (!body.variantId) return NextResponse.json({ error: "variantId required" }, { status: 400 });

    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
    const pages = (book.coloringPages as any[]) || [];
    const idx = pages.findIndex((p) => p.id === pageId);
    if (idx === -1) return NextResponse.json({ error: "Page not found" }, { status: 404 });

    pages[idx] = selectVariant(pages[idx], body.variantId);
    await prisma.book.update({ where: { id: bookId }, data: { coloringPages: pages as any } });
    return NextResponse.json({ success: true, selectedVariantId: body.variantId });
  } catch (error) {
    console.error("[books/page-variants PATCH] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
