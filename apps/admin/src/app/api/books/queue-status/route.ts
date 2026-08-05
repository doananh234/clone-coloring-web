import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@vx/db";
import { requireOperator } from "@/lib/auth/require-operator";

export const dynamic = "force-dynamic";

export const QUEUE_STATUSES = ["todo", "in_progress", "review", "done"] as const;

const schema = z.object({
  bookId: z.string().min(1),
  status: z.enum(QUEUE_STATUSES),
});

/**
 * Move a book across the "My queue" kanban (book.data.queueStatus).
 * Non-admins may only move books assigned to them; admins may move any book.
 */
export async function POST(req: NextRequest) {
  const auth = await requireOperator(req);
  if ("error" in auth) return auth.error;
  const { operator } = auth;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const { bookId, status } = parsed.data;

  const book = await prisma.book.findUnique({ where: { id: bookId }, select: { data: true, assignedToId: true } });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  if (operator.role !== "admin" && book.assignedToId !== operator.sub) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const data = (book.data && typeof book.data === "object" ? { ...(book.data as Record<string, unknown>) } : {}) as Record<string, unknown>;
  data.queueStatus = status;
  await prisma.book.update({ where: { id: bookId }, data: { data: data as never } });

  return NextResponse.json({ success: true, status });
}
