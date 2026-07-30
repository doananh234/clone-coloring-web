import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@vx/db";
import { requireAdmin } from "@/lib/auth/require-operator";
import { hashPassword } from "@/lib/auth/password";

export const dynamic = "force-dynamic";

const SELECT = { id: true, username: true, name: true, role: true, disabled: true, lastLoginAt: true, createdAt: true } as const;

type Ctx = { params: Promise<{ id: string }> };

// True when the target is currently the only enabled admin (protects against lockout).
async function isLastEnabledAdmin(target: { role: string; disabled: boolean }): Promise<boolean> {
  if (target.role !== "admin" || target.disabled) return false;
  const enabledAdmins = await prisma.operator.count({ where: { role: "admin", disabled: false } });
  return enabledAdmins <= 1;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const operator = await prisma.operator.findUnique({ where: { id }, select: SELECT });
  if (!operator) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ data: operator });
}

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  role: z.enum(["admin", "operator"]).optional(),
  disabled: z.boolean().optional(),
  password: z.string().min(6).max(200).optional(),
});

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const current = await prisma.operator.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Prevent removing the last enabled admin via disable or demotion.
  const wouldDropAdmin = body.disabled === true || body.role === "operator";
  if (wouldDropAdmin && (await isLastEnabledAdmin(current))) {
    return NextResponse.json({ error: "Không thể vô hiệu hoá quản trị viên cuối cùng" }, { status: 409 });
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.role !== undefined) data.role = body.role;
  if (body.disabled !== undefined) data.disabled = body.disabled;
  if (body.password !== undefined) data.passwordHash = await hashPassword(body.password);

  const updated = await prisma.operator.update({ where: { id }, data, select: SELECT });
  return NextResponse.json({ data: updated });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const current = await prisma.operator.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (await isLastEnabledAdmin(current)) {
    return NextResponse.json({ error: "Không thể xoá quản trị viên cuối cùng" }, { status: 409 });
  }

  await prisma.operator.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
