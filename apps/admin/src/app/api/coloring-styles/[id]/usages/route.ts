import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";

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
    // jsonb @>: only books whose coloringPages array has an element with this styleId.
    const books = await prisma.book.findMany({
      where: { coloringPages: { array_contains: [{ coloringStyleId: id }] } },
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
