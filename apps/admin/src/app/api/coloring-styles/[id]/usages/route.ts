import { NextRequest, NextResponse } from "next/server";
import { prisma, isSqlite, Prisma } from "@vx/db";

type PageEntry = {
  id?: string;
  coloringStyleId?: string | null;
  coloringVariantId?: string | null;
  coloredUrl?: string | null;
};

type Usage = {
  bookId: string;
  bookTitle: string;
  pageId: string;
  coloredUrl: string;
  coloringVariantId: string | null;
};

// Bound the scan: a widely-reused style could otherwise pull every matching
// book's full coloringPages array into memory and double-loop unbounded.
const MAX_BOOKS = 500;
const MAX_USAGES = 500;

/** GET the book pages colorized with this coloring style (per-page coloringStyleId). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    // Postgres: jsonb @> pre-filters to books whose coloringPages array has an
    // element with this styleId. SQLite has no array_contains — fetch a bounded
    // slice and rely on the per-page JS filter below (fine for local dev volumes).
    // `array_contains` isn't a key on the SQLite-generated Json filter type, so
    // build the Postgres branch through a cast to keep both clients type-checking.
    const where: Prisma.BookWhereInput = isSqlite()
      ? {}
      : ({ coloringPages: { array_contains: [{ coloringStyleId: id }] } } as Prisma.BookWhereInput);
    const books = await prisma.book.findMany({
      where,
      select: { id: true, title: true, coloringPages: true },
      take: MAX_BOOKS,
    });

    const usages: Usage[] = [];
    let truncated = books.length >= MAX_BOOKS;
    outer: for (const book of books) {
      const pages = (book.coloringPages as PageEntry[] | null) ?? [];
      for (const p of pages) {
        if (p.coloringStyleId === id && p.id && p.coloredUrl) {
          usages.push({
            bookId: book.id,
            bookTitle: book.title ?? "",
            pageId: p.id,
            coloredUrl: p.coloredUrl,
            coloringVariantId: p.coloringVariantId ?? null,
          });
          if (usages.length >= MAX_USAGES) {
            truncated = true;
            break outer;
          }
        }
      }
    }
    return NextResponse.json({ usages, truncated });
  } catch (error) {
    console.error("[coloring-styles/usages GET] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
