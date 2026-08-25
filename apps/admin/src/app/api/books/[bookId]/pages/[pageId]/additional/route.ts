import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@vx/db";
import { editImage } from "@vx/server-core/ai";
import { buildRedesignPrompt } from "@vx/server-core/ai/prompts";
import { getR2Config, createR2Client, uploadToR2, resolveR2Url } from "@vx/server-core/r2";
import { flushLangfuse } from "@vx/server-core/langfuse";
import { additionalParentNumber, buildAdditionalPage, type BookColoringPage } from "@vx/coloring/data/additional-pages";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ bookId: string; pageId: string }> };

/**
 * Regen Thêm: generate `count` NEW additional interior pages from one source
 * page and append them to book.coloringPages (origin:"additional"). Replaces the
 * old per-page variant flow — these are full interior pages (counted/exported/PDF).
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId, pageId } = await params;
    const body = (await req.json().catch(() => ({}))) as { count?: number; source?: "A" | "B"; changePercent?: number; provider?: string };
    const count = Math.min(4, Math.max(1, body.count ?? 1));
    const source: "A" | "B" = body.source === "B" ? "B" : "A";
    const pct = Math.min(95, Math.max(5, body.changePercent ?? 30));
    const provider = body.provider === "kingcong" || body.provider === "diaflow" ? body.provider : undefined;

    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
    const pages = (book.coloringPages as unknown as BookColoringPage[]) ?? [];
    const idx = pages.findIndex((p) => p.id === pageId);
    if (idx === -1) return NextResponse.json({ error: "Page not found" }, { status: 404 });

    const src = pages[idx];
    const parentPageNumber = additionalParentNumber(src, idx);
    const anchorUrl = resolveR2Url(src.url);

    const originalPrompt = typeof src.prompt === "string" ? src.prompt.trim() : "";
    const useB = source === "B" && originalPrompt.length > 0;
    const prompt = useB
      ? `${buildRedesignPrompt(pct)}\n\nORIGINAL SCENE DESCRIPTION (keep faithful to this):\n${originalPrompt}`
      : buildRedesignPrompt(pct);

    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);
    const created: BookColoringPage[] = [];
    for (let k = 0; k < count; k++) {
      const img = await editImage(anchorUrl, prompt, {
        provider,
        trace: { caller: "books/page-additional", entityType: "book", entityId: bookId },
      });
      const base64 = img.base64 || img.dataUrl?.split(",")[1] || "";
      if (!base64) throw new Error("editImage returned no image data");
      const newId = crypto.randomUUID();
      const key = `assets/${bookId}/pages/${newId}.png`;
      const { url } = await uploadToR2({ client: r2Client, config: r2Config, key, body: Buffer.from(base64, "base64"), contentType: "image/png" });
      created.push(buildAdditionalPage({ id: newId, url, parentPageNumber, ...(useB ? { prompt: originalPrompt } : {}) }));
    }

    const updated = [...pages, ...created];
    await prisma.book.update({ where: { id: bookId }, data: { coloringPages: updated as never } });
    await flushLangfuse();
    return NextResponse.json({ success: true, added: created.length });
  } catch (error) {
    console.error("[books/page-additional POST] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
