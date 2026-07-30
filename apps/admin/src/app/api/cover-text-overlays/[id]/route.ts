import { NextRequest, NextResponse } from "next/server";
import { prisma, Prisma } from "@vx/db";

/** True when Prisma failed because the record targeted by get/update/delete doesn't exist. */
function isRecordNotFoundError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2025";
  }
  // Fallback for environments where the class identity check doesn't line up
  // (e.g. mocked modules in tests) — Prisma's known errors always carry a `code`.
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2025";
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const coverTextOverlay = await prisma.coverTextOverlay.findUnique({ where: { id } });
    if (!coverTextOverlay) {
      return NextResponse.json({ error: "Không tìm thấy cover text overlay" }, { status: 404 });
    }
    return NextResponse.json(coverTextOverlay);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const { name, elements, referenceImageUrl } = body as {
      name?: string;
      elements?: unknown;
      referenceImageUrl?: string | null;
    };

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (elements !== undefined) data.elements = elements;
    if (referenceImageUrl !== undefined) data.referenceImageUrl = referenceImageUrl;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Không có trường nào để cập nhật" }, { status: 400 });
    }

    const coverTextOverlay = await prisma.coverTextOverlay.update({ where: { id }, data });
    return NextResponse.json(coverTextOverlay);
  } catch (error) {
    if (isRecordNotFoundError(error)) {
      return NextResponse.json({ error: "Không tìm thấy cover text overlay" }, { status: 404 });
    }
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.coverTextOverlay.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (isRecordNotFoundError(error)) {
      return NextResponse.json({ error: "Không tìm thấy cover text overlay" }, { status: 404 });
    }
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
