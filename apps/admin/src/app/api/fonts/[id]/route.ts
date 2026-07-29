import { NextRequest, NextResponse } from "next/server";
import { prisma, Prisma } from "@vx/db";

/** True when Prisma failed because the record targeted by delete/update doesn't exist. */
function isRecordNotFoundError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2025";
  }
  // Fallback for environments where the class identity check doesn't line up
  // (e.g. mocked modules in tests) — Prisma's known errors always carry a `code`.
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2025";
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.font.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (isRecordNotFoundError(error)) {
      return NextResponse.json({ error: "Không tìm thấy font" }, { status: 404 });
    }
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { name } = (await req.json()) as { name?: string };
    if (!name) return NextResponse.json({ error: "name là bắt buộc" }, { status: 400 });
    const font = await prisma.font.update({ where: { id }, data: { name } });
    return NextResponse.json({ success: true, font });
  } catch (error) {
    if (isRecordNotFoundError(error)) {
      return NextResponse.json({ error: "Không tìm thấy font" }, { status: 404 });
    }
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
