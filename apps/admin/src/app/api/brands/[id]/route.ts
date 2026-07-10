import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const brand = await prisma.brand.findUnique({ where: { id } });
    if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const flatData = (brand.data as Record<string, unknown> | null | undefined) ?? {};
    return NextResponse.json({
      ...brand,
      coloringStyleId: typeof flatData.coloringStyleId === "string" ? flatData.coloringStyleId : null,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const { id: _id, createdAt, updatedAt, coloringStyleId, ...rest } = body;
    const existing = await prisma.brand.findUnique({ where: { id } });
    const currentData = (existing?.data as Record<string, unknown> | null | undefined) ?? {};
    const nextData: Record<string, unknown> = rest.data && typeof rest.data === "object" ? { ...rest.data } : { ...currentData };
    if ("coloringStyleId" in body) {
      if (typeof coloringStyleId === "string" && coloringStyleId.trim()) {
        nextData.coloringStyleId = coloringStyleId.trim();
      } else {
        delete nextData.coloringStyleId;
      }
    }
    const { data: _dataFromRest, ...restNoData } = rest;
    const brand = await prisma.brand.update({
      where: { id },
      data: { ...restNoData, data: nextData as never },
    });
    const flatData = (brand.data as Record<string, unknown> | null | undefined) ?? {};
    return NextResponse.json({
      ...brand,
      coloringStyleId: typeof flatData.coloringStyleId === "string" ? flatData.coloringStyleId : null,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.brand.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
