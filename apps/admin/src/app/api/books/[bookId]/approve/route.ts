// apps/admin/src/app/api/books/[bookId]/approve/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { getOperatorFromRequest } from "@/lib/auth/require-operator";

export const dynamic = "force-dynamic";

/**
 * Approve a book: sets isPublic=true ("Đã duyệt"). Authorization is the sole
 * responsibility of this route (the client cannot check assignee locally):
 * allowed for admins, or the operator the book is assigned to. Assignment is
 * left untouched.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const operator = await getOperatorFromRequest(_req);
  if (!operator) return NextResponse.json({ error: "auth required" }, { status: 401 });

  const book = await prisma.book.findUnique({ where: { id: bookId }, select: { id: true, assignedToId: true } });
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed = operator.role === "admin" || operator.sub === book.assignedToId;
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const updated = await prisma.book.update({ where: { id: bookId }, data: { isPublic: true } });
  return NextResponse.json({ success: true, book: updated });
}
