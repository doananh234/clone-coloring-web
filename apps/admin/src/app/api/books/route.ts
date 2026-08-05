import { NextRequest, NextResponse } from "next/server";
import { prisma, type Prisma } from "@vx/db";
import { getOperatorFromRequest } from "@/lib/auth/require-operator";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") || "1");
  const limit = Number(searchParams.get("limit") || "20");
  // Full-library search/filter — applied in the query, NOT client-side on the
  // current page (the old bug: search only saw the 24 rows already fetched).
  const q = (searchParams.get("q") || "").trim();
  const cat = (searchParams.get("cat") || "").trim();
  const status = (searchParams.get("status") || "all").trim();

  const and: Prisma.BookWhereInput[] = [];
  if (q) {
    // Title + subtitle are scalar (case-insensitive contains); niche is stored
    // in data.nicheLower for a case-insensitive JSON substring match.
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { subtitle: { contains: q, mode: "insensitive" } },
        { data: { path: ["nicheLower"], string_contains: q.toLowerCase() } },
      ],
    });
  }
  if (cat) and.push({ category: cat });
  if (status === "pub") and.push({ isPublic: true });
  else if (status === "draft") and.push({ isPublic: false });

  // Assignment visibility: a non-admin operator sees only unassigned books plus
  // the ones assigned to them. Admins (and unauthenticated dev calls) see all.
  const operator = await getOperatorFromRequest(req);
  if (operator && operator.role !== "admin") {
    and.push({ OR: [{ assignedToId: null }, { assignedToId: operator.sub }] });
  }

  // Explicit assignment filter ("my job" = books assigned to the caller).
  const assign = (searchParams.get("assign") || "").trim();
  if (assign === "mine" && operator) and.push({ assignedToId: operator.sub });
  else if (assign === "unassigned") and.push({ assignedToId: null });

  const where: Prisma.BookWhereInput = and.length ? { AND: and } : {};

  try {
    const [rows, total] = await Promise.all([
      prisma.book.findMany({
        where,
        // List view never uses per-page arrays; omit the heavy Json columns
        // (coloringPages ~130KB/book) so the payload drops ~90% (2.7MB→~200KB
        // for 20 books). The book detail route returns full coloringPages.
        omit: { coloringPages: true, summaryPages: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.book.count({ where }),
    ]);
    // Surface the denormalized niche as a top-level field for the card badge.
    const data = rows.map((b) => ({
      ...b,
      niche: (b.data as { niche?: unknown } | null)?.niche ?? null,
      queueStatus: (b.data as { queueStatus?: unknown } | null)?.queueStatus ?? "todo",
    }));
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
