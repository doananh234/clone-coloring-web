import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") || "1");
  const limit = Number(searchParams.get("limit") || "20");
  try {
    const [data, total] = await Promise.all([
      prisma.coverTextOverlay.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.coverTextOverlay.count(),
    ]);
    return NextResponse.json({
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, elements, referenceImageUrl } = body as {
      name?: string;
      elements?: unknown;
      referenceImageUrl?: string;
    };
    if (!name) {
      return NextResponse.json({ error: "name là bắt buộc" }, { status: 400 });
    }
    const coverTextOverlay = await prisma.coverTextOverlay.create({
      data: {
        name,
        elements: elements !== undefined ? (elements as object) : {},
        referenceImageUrl: referenceImageUrl ?? null,
      },
    });
    return NextResponse.json(coverTextOverlay, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
