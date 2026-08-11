import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@vx/db";
import {
  ensureSourceCandidate, addCandidate, selectCandidate,
  type CoverCandidate,
} from "@vx/coloring/data/cover-candidates";

type RouteParams = { params: Promise<{ bookId: string }> };

/** Read the book's cover state from the coverUrl column + book.data JSON. */
function readState(book: { coverUrl: string | null; data: unknown }) {
  const data = (book.data as Record<string, unknown> | null) ?? {};
  return {
    curData: data,
    state: {
      coverUrl: book.coverUrl ?? undefined,
      coverCandidates: data.coverCandidates as CoverCandidate[] | undefined,
      selectedCoverCandidateId: data.selectedCoverCandidateId as string | undefined,
    },
  };
}

/** Persist the cover state back onto the coverUrl column + book.data JSON. */
async function writeState(bookId: string, curData: Record<string, unknown>, state: {
  coverUrl?: string; coverCandidates?: CoverCandidate[]; selectedCoverCandidateId?: string;
}) {
  await prisma.book.update({
    where: { id: bookId },
    data: {
      coverUrl: state.coverUrl ?? "",
      data: { ...curData, coverCandidates: state.coverCandidates, selectedCoverCandidateId: state.selectedCoverCandidateId } as any,
    },
  });
}

/** Push to Cover: add the page's colored image as a candidate and auto-select it. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId } = await params;
    const body = (await req.json().catch(() => ({}))) as { url?: string; fromPageId?: string };
    if (!body.url) return NextResponse.json({ error: "url required" }, { status: 400 });

    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
    const { curData, state: state0 } = readState(book);

    const now = new Date().toISOString();
    const seeded = ensureSourceCandidate(state0, () => crypto.randomUUID(), now);
    let state = seeded.state;

    const pushed: CoverCandidate = {
      id: crypto.randomUUID(), url: body.url, origin: "pushed",
      ...(body.fromPageId ? { fromPageId: body.fromPageId } : {}),
      createdAt: new Date().toISOString(),
    };
    state = addCandidate(state, pushed); // dedupes by url
    const target = (state.coverCandidates ?? []).find((c) => c.url === body.url)!;
    state = selectCandidate(state, target.id);

    await writeState(bookId, curData, state);
    return NextResponse.json({ success: true, selectedCoverCandidateId: state.selectedCoverCandidateId });
  } catch (error) {
    console.error("[books/cover-candidates POST] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

/** Select a candidate as the live cover (mirrors coverUrl). */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId } = await params;
    const body = (await req.json().catch(() => ({}))) as { candidateId?: string };
    if (!body.candidateId) return NextResponse.json({ error: "candidateId required" }, { status: 400 });

    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
    const { curData, state } = readState(book);

    const next = selectCandidate(state, body.candidateId);
    await writeState(bookId, curData, next);
    return NextResponse.json({ success: true, selectedCoverCandidateId: body.candidateId });
  } catch (error) {
    console.error("[books/cover-candidates PATCH] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
