import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { textPrompt, buildSubtitlePrompt } from "@vx/server-core/ai";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;

  try {
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const prompt = buildSubtitlePrompt(book.title, book.description || "");
    const subtitle = await textPrompt(prompt, { maxTokens: 50, temperature: 0.7 });

    // Save to Postgres
    await prisma.book.update({
      where: { id: bookId },
      data: { subtitle },
    });

    return NextResponse.json({ bookId, subtitle });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
