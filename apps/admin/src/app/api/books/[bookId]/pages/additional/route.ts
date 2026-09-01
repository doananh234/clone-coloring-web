import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import type { BookColoringPage } from "@vx/coloring/data/additional-pages";

type RouteParams = { params: Promise<{ bookId: string }> };

/**
 * Purge additional (origin:"additional") interior pages from a book — used to
 * clean up wrongly-generated fill pages. Keeps every original/clone page intact.
 */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId } = await params;
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

    const pages = (book.coloringPages as unknown as BookColoringPage[]) ?? [];
    const kept = pages.filter((p) => p.origin !== "additional");
    const removed = pages.length - kept.length;
    if (removed > 0) {
      await prisma.book.update({ where: { id: bookId }, data: { coloringPages: kept as never } });
    }
    return NextResponse.json({ success: true, removed, remaining: kept.length });
  } catch (error) {
    console.error("[books/pages/additional DELETE] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
