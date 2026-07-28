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
    // `coverMeta` is NOT a Book column — it lives inside the Book.data JSON blob.
    // Clients (including the cover-save flow + the old UI) send it at the top level,
    // which makes prisma.update throw. Fold it into `data` instead of passing it raw.
    const { id: _id, createdAt: _c, updatedAt: _u, coverMeta, ...rest } = body;
    const data: Record<string, unknown> = { ...rest };
    if (coverMeta !== undefined) {
      const current = await prisma.book.findUnique({ where: { id: bookId }, select: { data: true } });
      const curData = (current?.data as Record<string, unknown> | null) ?? {};
      const incomingData = (rest.data as Record<string, unknown> | undefined) ?? {};
      data.data = { ...curData, ...incomingData, coverMeta };
    }
    const book = await prisma.book.update({ where: { id: bookId }, data });
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
