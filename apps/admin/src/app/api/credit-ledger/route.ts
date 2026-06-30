import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") || "1");
  const limit = Number(searchParams.get("limit") || "100");
  const search = searchParams.get("search") || "";

  const where = search
    ? {
        OR: [
          { userId: { contains: search, mode: "insensitive" as const } },
          { type: { contains: search, mode: "insensitive" as const } },
          { description: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  try {
    const [data, total] = await Promise.all([
      prisma.creditLedger.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.creditLedger.count({ where }),
    ]);
    return NextResponse.json({
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
