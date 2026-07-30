import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@vx/db";
import { requireAdmin } from "@/lib/auth/require-operator";
import { hashPassword } from "@/lib/auth/password";

export const dynamic = "force-dynamic";

// Shape returned to the client — never includes passwordHash.
type OperatorRecord = {
  id: string;
  username: string;
  name: string;
  role: string;
  disabled: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
};

function toDto(o: OperatorRecord) {
  return {
    id: o.id,
    username: o.username,
    name: o.name,
    role: o.role,
    disabled: o.disabled,
    lastLoginAt: o.lastLoginAt,
    createdAt: o.createdAt,
  };
}

const SELECT = { id: true, username: true, name: true, role: true, disabled: true, lastLoginAt: true, createdAt: true } as const;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const operators = await prisma.operator.findMany({ orderBy: { createdAt: "asc" }, select: SELECT });
  return NextResponse.json({ data: operators.map(toDto) });
}

const createSchema = z.object({
  username: z.string().min(3).max(64),
  name: z.string().min(1).max(120),
  password: z.string().min(6).max(200),
  role: z.enum(["admin", "operator"]),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const existing = await prisma.operator.findUnique({ where: { username: body.username } });
  if (existing) return NextResponse.json({ error: "Tên đăng nhập đã tồn tại" }, { status: 409 });

  const created = await prisma.operator.create({
    data: {
      username: body.username,
      name: body.name,
      role: body.role,
      passwordHash: await hashPassword(body.password),
    },
    select: SELECT,
  });
  return NextResponse.json({ data: toDto(created) }, { status: 201 });
}
