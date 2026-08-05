import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@vx/db";
import { requireOperator } from "@/lib/auth/require-operator";

export const dynamic = "force-dynamic";

const schema = z.object({
  bookIds: z.array(z.string().min(1)).min(1),
  // Operator id to assign to, or null to unassign (unassign is admin-only).
  assigneeId: z.string().min(1).nullable().optional(),
});

/**
 * Assign one or more books to an operator.
 *  - Admin: may assign to ANY operator, or pass assigneeId=null to unassign.
 *  - Non-admin: may only assign to THEMSELVES (assigneeId is forced to their own
 *    id); they cannot assign to others or unassign.
 * Once assigned, the book disappears from other non-admin operators' book list
 * (see the filter in GET /api/books) while staying visible to admins.
 */
export async function POST(req: NextRequest) {
  const auth = await requireOperator(req);
  if ("error" in auth) return auth.error;
  const { operator } = auth;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const { bookIds } = parsed.data;
  const isAdmin = operator.role === "admin";

  // Non-admins can only claim books for themselves.
  const assigneeId = isAdmin ? (parsed.data.assigneeId ?? null) : operator.sub;

  // If admin targets a specific operator, make sure it exists.
  if (isAdmin && assigneeId) {
    const target = await prisma.operator.findUnique({ where: { id: assigneeId }, select: { id: true } });
    if (!target) return NextResponse.json({ error: "Assignee not found" }, { status: 404 });
  }

  const result = await prisma.book.updateMany({
    where: { id: { in: bookIds } },
    data: { assignedToId: assigneeId },
  });

  return NextResponse.json({ success: true, updated: result.count, assigneeId });
}
