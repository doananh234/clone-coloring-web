import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") || "1");
  const limit = Number(searchParams.get("limit") || "20");
  try {
    const [brands, total] = await Promise.all([
      prisma.brand.findMany({
        orderBy: { index: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.brand.count(),
    ]);
    const data = brands.map((brand) => {
      const flatData = (brand.data as Record<string, unknown> | null | undefined) ?? {};
      return {
        ...brand,
        coloringStyleId: typeof flatData.coloringStyleId === "string" ? flatData.coloringStyleId : null,
      };
    });
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
    const { coloringStyleId, ...rest } = body;
    const existingData = (rest.data && typeof rest.data === "object") ? rest.data : {};
    const brand = await prisma.brand.create({
      data: {
        ...rest,
        data: {
          ...existingData,
          ...(typeof coloringStyleId === "string" && coloringStyleId.trim()
            ? { coloringStyleId: coloringStyleId.trim() }
            : {}),
        },
      },
    });
    const flatData = (brand.data as Record<string, unknown> | null | undefined) ?? {};
    return NextResponse.json(
      { ...brand, coloringStyleId: typeof flatData.coloringStyleId === "string" ? flatData.coloringStyleId : null },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
