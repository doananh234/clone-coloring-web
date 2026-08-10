import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { deleteVariant } from "@vx/coloring/data/page-variants";

type RouteParams = { params: Promise<{ bookId: string; pageId: string; variantId: string }> };

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId, pageId, variantId } = await params;
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
    const pages = (book.coloringPages as any[]) || [];
    const idx = pages.findIndex((p) => p.id === pageId);
    if (idx === -1) return NextResponse.json({ error: "Page not found" }, { status: 404 });

    pages[idx] = deleteVariant(pages[idx], variantId); // throws on selected/original
    await prisma.book.update({ where: { id: bookId }, data: { coloringPages: pages as any } });
    return NextResponse.json({ success: true, removed: variantId });
  } catch (error) {
    console.error("[books/page-variants DELETE] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
