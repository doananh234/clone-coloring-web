import { NextResponse } from "next/server";
import { prisma } from "@vx/db";

export const dynamic = "force-dynamic";

/**
 * Giá trị có thật cho hai dropdown lọc (jobs + books). Đọc DISTINCT từ
 * SourceBook thay vì hardcode: dữ liệu thật có cả "Stoner", "Quote", "Pattern"
 * ngoài danh sách người dùng mô tả ban đầu, hardcode là sót.
 */
export async function GET() {
  try {
    const [niches, priorities] = await Promise.all([
      prisma.sourceBook.findMany({
        where: { niche: { not: null } },
        distinct: ["niche"],
        select: { niche: true },
        orderBy: { niche: "asc" },
      }),
      prisma.sourceBook.findMany({
        where: { priority: { not: null } },
        distinct: ["priority"],
        select: { priority: true },
        orderBy: { priority: "asc" },
      }),
    ]);

    return NextResponse.json({
      niches: niches.map((r) => r.niche).filter((v): v is string => Boolean(v)),
      priorities: priorities.map((r) => r.priority).filter((v): v is string => Boolean(v)),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
