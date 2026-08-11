import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { deleteCandidate, type CoverCandidate } from "@vx/coloring/data/cover-candidates";

type RouteParams = { params: Promise<{ bookId: string; candidateId: string }> };

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId, candidateId } = await params;
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
    const data = (book.data as Record<string, unknown> | null) ?? {};
    const state = {
      coverUrl: book.coverUrl ?? undefined,
      coverCandidates: data.coverCandidates as CoverCandidate[] | undefined,
      selectedCoverCandidateId: data.selectedCoverCandidateId as string | undefined,
    };

    const next = deleteCandidate(state, candidateId); // throws on selected/unknown
    await prisma.book.update({
      where: { id: bookId },
      data: {
        coverUrl: next.coverUrl ?? "",
        data: { ...data, coverCandidates: next.coverCandidates, selectedCoverCandidateId: next.selectedCoverCandidateId } as any,
      },
    });
    return NextResponse.json({ success: true, removed: candidateId });
  } catch (error) {
    console.error("[books/cover-candidates DELETE] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
