import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") || "1");
  const limit = Number(searchParams.get("limit") || "20");
  try {
    const [data, total] = await Promise.all([
      prisma.book.findMany({
        // List view never uses per-page arrays; omit the heavy Json columns
        // (coloringPages ~130KB/book) so the payload drops ~90% (2.7MB→~200KB
        // for 20 books). The book detail route returns full coloringPages.
        omit: { coloringPages: true, summaryPages: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.book.count(),
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
    const book = await prisma.book.create({ data: body });
    return NextResponse.json(book, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
