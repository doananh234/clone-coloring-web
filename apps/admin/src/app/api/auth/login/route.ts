import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@vx/db";
import { verifyPassword } from "@/lib/auth/password";
import { signSessionToken } from "@/lib/auth/jwt";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const operator = await prisma.operator.findUnique({ where: { username: body.username } });
  const ok = operator && !operator.disabled && (await verifyPassword(body.password, operator.passwordHash));
  if (!operator || !ok) {
    return NextResponse.json({ error: "Sai tài khoản hoặc mật khẩu" }, { status: 401 });
  }

  await prisma.operator.update({ where: { id: operator.id }, data: { lastLoginAt: new Date() } });
  const token = await signSessionToken({
    sub: operator.id,
    username: operator.username,
    role: operator.role,
    name: operator.name,
  });

  return NextResponse.json({
    token,
    user: { id: operator.id, username: operator.username, name: operator.name, role: operator.role },
  });
}
