import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  try {
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(book);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  try {
    const body = await req.json();
    // Non-column fields live inside Book.data JSON. `data` (a partial blob),
    // `coverMeta` and `coverLayout` are all merged into the existing Book.data
    // NON-destructively so we never clobber keys the form didn't touch.
    const {
      id: _id,
      createdAt: _c,
      updatedAt: _u,
      coverMeta,
      coverLayout,
      data: incomingData,
      ...cols
    } = body;
    const update: Record<string, unknown> = { ...cols };
    const touchesData =
      incomingData !== undefined || coverMeta !== undefined || coverLayout !== undefined;
    if (touchesData) {
      const current = await prisma.book.findUnique({ where: { id: bookId }, select: { data: true } });
      const curData = (current?.data as Record<string, unknown> | null) ?? {};
      const merged: Record<string, unknown> = {
        ...curData,
        ...((incomingData as Record<string, unknown> | undefined) ?? {}),
      };
      if (coverMeta !== undefined) merged.coverMeta = coverMeta;
      if (coverLayout !== undefined) merged.coverLayout = coverLayout;
      update.data = merged;
    }
    const book = await prisma.book.update({ where: { id: bookId }, data: update });
    return NextResponse.json(book);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  try {
    await prisma.book.delete({ where: { id: bookId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
