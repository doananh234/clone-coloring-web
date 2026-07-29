import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.font.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
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
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
