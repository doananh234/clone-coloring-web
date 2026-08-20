import { NextRequest, NextResponse } from "next/server";
import { prisma, Prisma } from "@vx/db";
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
    // Title + subtitle + niche are all scalar columns (case-insensitive contains).
    // `niche` is a denormalized column kept in sync by the book_denorm_perf DB
    // trigger, so this no longer detoasts data.nicheLower per row.
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { subtitle: { contains: q, mode: "insensitive" } },
        { niche: { contains: q, mode: "insensitive" } },
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
  // "assigned" = any book that has an assignee (used by the admin queue board,
  // which must only show work that's actually in someone's queue).
  else if (assign === "assigned") and.push({ assignedToId: { not: null } });

  // Specific-assignee filter (admin queue board person picker) — an indexed
  // scalar column ([assignedToId, createdAt]), so this replaces the old
  // "fetch everyone's queue then filter by person client-side".
  const assignee = (searchParams.get("assignee") || "").trim();
  if (assignee) and.push({ assignedToId: assignee });

  // Etsy listings screen: only books that have listing content
  // (book.data.etsyListing present & non-null). Low-traffic screen, so a JSONB
  // path predicate is acceptable here; denormalize to a scalar if it grows.
  const etsy = (searchParams.get("etsy") || "").trim();
  if (etsy === "1") and.push({ data: { path: ["etsyListing"], not: Prisma.AnyNull } });

  // "Interior > 40" filter. `interiorPages` is a denormalized scalar column
  // (coloringPages length), maintained by the book_denorm_perf DB trigger, so
  // this is an indexed btree range instead of a JSONB path scan + detoast.
  const interior = (searchParams.get("interior") || "").trim();
  if (interior === "gt40") {
    and.push({ interiorPages: { gt: 40 } });
  }

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
    // Surface denormalized fields from the data JSON (niche, queueStatus, exportUrl) as top-level fields for the list cards.
    const data = rows.map((b) => ({
      ...b,
      niche: (b.data as { niche?: unknown } | null)?.niche ?? null,
      queueStatus: (b.data as { queueStatus?: unknown } | null)?.queueStatus ?? "todo",
      exportUrl: (b.data as { export?: { url?: string } } | null)?.export?.url ?? null,
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
