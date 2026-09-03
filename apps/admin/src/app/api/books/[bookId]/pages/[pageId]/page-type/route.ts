import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@vx/db";
import { applyPageType, findBookPage, type BookPagesState } from "@vx/coloring/data/page-type";
import type { BookColoringPage } from "@vx/coloring/data/additional-pages";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ bookId: string; pageId: string }> };

const schema = z.object({ type: z.enum(["cover", "intro", "interior"]) });

/**
 * Re-classify a book page (cover / intro / interior) after create-book's initial
 * split. Moves the page between summaryPages (intro) and coloringPages (interior),
 * or points coverUrl at it (cover). See applyPageType for the exact semantics.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId, pageId } = await params;
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
    }

    const book = await prisma.book.findUnique({
      where: { id: bookId },
      select: { coverUrl: true, summaryPages: true, coloringPages: true },
    });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

    const state: BookPagesState = {
      coverUrl: book.coverUrl ?? "",
      summaryPages: (book.summaryPages as unknown as BookColoringPage[]) ?? [],
      coloringPages: (book.coloringPages as unknown as BookColoringPage[]) ?? [],
    };
    if (!findBookPage(state, pageId)) {
      return NextResponse.json({ error: "Page not found in this book" }, { status: 404 });
    }

    const next = applyPageType(state, pageId, parsed.data.type);
    await prisma.book.update({
      where: { id: bookId },
      data: {
        coverUrl: next.coverUrl,
        summaryPages: next.summaryPages as never,
        coloringPages: next.coloringPages as never,
      },
    });

    return NextResponse.json({ success: true, type: parsed.data.type });
  } catch (error) {
    console.error("[books/pages/page-type POST] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
