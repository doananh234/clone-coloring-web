// apps/admin/src/app/api/books/[bookId]/source-covers/[scId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import type { SourceCover } from "@vx/coloring/data/source-covers";

type RouteParams = { params: Promise<{ bookId: string; scId: string }> };

/** DELETE — remove one source cover from book.data.sourceCovers. */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId, scId } = await params;
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

    const data = (book.data as Record<string, unknown> | null) ?? {};
    const sourceCovers = ((data.sourceCovers as SourceCover[] | undefined) ?? []).filter((c) => c.id !== scId);
    await prisma.book.update({ where: { id: bookId }, data: { data: { ...data, sourceCovers } as never } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[books/source-covers DELETE] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
