import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { resolveR2Url } from "@vx/server-core/r2";
import type { BookColoringPage } from "@vx/coloring/data/additional-pages";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ bookId: string; pageId: string }> };

const MOTION_SERVICE_URL = process.env.MOTION_SERVICE_URL || "http://localhost:7801";

/**
 * Generate a "self-drawing" animation MP4 for one page via the @vx/motion
 * service, store its URL on the page (animationUrl), and return it. The motion
 * service traces the line-art, animates the strokes, encodes MP4, uploads to R2.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId, pageId } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      format?: "9:16" | "1:1" | "16:9";
      durationSec?: number;
    };

    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
    const pages = (book.coloringPages as unknown as BookColoringPage[]) ?? [];
    const idx = pages.findIndex((p) => p.id === pageId);
    if (idx === -1) return NextResponse.json({ error: "Page not found" }, { status: 404 });

    // Trace the B&W line-art; if the page is already colored, reveal that colored
    // version at the end so the animation matches what the user colored.
    const imageUrl = resolveR2Url(pages[idx].url);
    const coloredUrl = pages[idx].coloredUrl ? resolveR2Url(pages[idx].coloredUrl!) : undefined;
    const key = `assets/${bookId}/anim/${pageId}.mp4`;

    const res = await fetch(`${MOTION_SERVICE_URL}/animate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageUrl,
        colorImageUrl: coloredUrl,
        key,
        format: body.format ?? "9:16",
        durationSec: body.durationSec ?? 6,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Motion service ${res.status}: ${err.slice(0, 300)}` }, { status: 502 });
    }
    const { url } = (await res.json()) as { url?: string };
    if (!url) return NextResponse.json({ error: "Motion service returned no url" }, { status: 502 });

    // Non-destructively write animationUrl onto this page.
    const updated = pages.map((p, i) => (i === idx ? { ...p, animationUrl: url } : p));
    await prisma.book.update({ where: { id: bookId }, data: { coloringPages: updated as never } });

    return NextResponse.json({ success: true, url });
  } catch (error) {
    console.error("[books/page-animate POST] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
