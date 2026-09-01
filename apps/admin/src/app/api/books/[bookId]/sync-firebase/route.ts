// apps/admin/src/app/api/books/[bookId]/sync-firebase/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { configFor, toFirestoreDoc } from "@vx/server-core/firestore";
import { getSyncFirestore } from "@/lib/firebase-sync";

export const dynamic = "force-dynamic";

/**
 * POST — push ONE book from the local dev DB up to the real (prod) Firestore.
 *
 * Uses the SAME reverse mapper as the worker bulk sync so the written document
 * shape is identical (structure preserved). Writes with { merge: true } so
 * existing fields on a prod doc are never dropped by a manual sync.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params;
  try {
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) {
      return NextResponse.json({ error: `Book ${bookId} not found` }, { status: 404 });
    }

    const cfg = configFor("books");
    const doc = toFirestoreDoc(cfg, book as unknown as Record<string, unknown>);

    const { db, projectId } = getSyncFirestore();
    await db.collection(cfg.collection).doc(bookId).set(doc, { merge: true });

    return NextResponse.json({ success: true, projectId, bookId });
  } catch (error) {
    console.error("[books/sync-firebase] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
