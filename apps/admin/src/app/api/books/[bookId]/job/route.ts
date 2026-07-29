import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";

/**
 * Resolve the clone job that produced this book (reverse link: CloneJob.bookId /
 * resultBookId → Book.id). Used by the book detail "Job liên quan" button so the
 * operator can jump back to the job's compare tab. Returns the most recent match.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  try {
    const job = await prisma.cloneJob.findFirst({
      where: { OR: [{ bookId }, { resultBookId: bookId }] },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return NextResponse.json({ jobId: job?.id ?? null });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
