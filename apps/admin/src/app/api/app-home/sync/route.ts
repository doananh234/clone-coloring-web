import { prisma } from "@vx/db";
import { buildAppHomeDoc, type HomeBookInput, type HomeCategoryInput } from "@vx/server-core/home";
import { NextResponse } from "next/server";

const R2_PUBLIC_BASE_URL =
  process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || process.env.R2_PUBLIC_BASE_URL || "";

function resolveUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (R2_PUBLIC_BASE_URL) return `${R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  return url;
}

/**
 * "Auto config" — rebuild the local `app/home` config from the current books +
 * categories using the heuristic in buildAppHomeDoc (newest → new arrivals,
 * most-pages → trending, one interior page per book → free), in the EXACT
 * Firestore schema. The admin Home screen can then hand-edit the lists before
 * publishing to Firebase.
 */
export async function POST() {
  try {
    const [booksRaw, categoriesRaw] = await Promise.all([
      prisma.book.findMany(),
      prisma.category.findMany({ orderBy: { index: "asc" } }),
    ]);

    const doc = buildAppHomeDoc({
      books: booksRaw as unknown as HomeBookInput[],
      categories: categoriesRaw as unknown as HomeCategoryInput[],
      resolveUrl,
    });

    // Fetch all books with cover
    const books = booksRaw.filter((b) => b.coverUrl);

    // Sort by createdAt DESC for new arrivals
    const sorted = [...books].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );

    const newArrivalBooks = sorted.slice(0, 10).map((b) => ({
      id: b.id,
      title: b.title || "",
      coverUrl: resolveUrl(b.coverUrl),
      price: b.price || "",
      subtitle: b.subtitle || "",
      // ISO 8601 rather than a Firestore Timestamp: this payload is stored in the Prisma
      // `App.data` JSON column and copied to Firestore opaquely by the worker's reverseApp(),
      // and a Timestamp cannot survive that round trip. The app counts "new this month" from
      // this field, and treats a missing value as "not new" rather than guessing.
      publishedAt: b.createdAt.toISOString(),
    }));

    // Sort by coloring pages count DESC for trending
    const byPages = [...books].sort(
      (a, b) =>
        ((b.coloringPages as unknown[])?.length || 0) -
        ((a.coloringPages as unknown[])?.length || 0),
    );

    const trendingBooks = byPages.slice(0, 10).map((b, i) => ({
      id: b.id,
      rank: i + 1,
      title: b.title || "",
      subtitle: b.subtitle || "",
      imageUrl: resolveUrl(b.coverUrl),
      participantCount: String((b.coloringPages as unknown[])?.length || 0),
    }));

    // Rotates weekly over the newest books, deterministically: the same week always resolves
    // to the same book, so the pick is stable across repeated syncs within a week and moves on
    // its own at the week boundary without anyone having to curate manually.
    const botwPool = sorted.slice(0, 10);
    const weekIndex = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
    const botwSource = botwPool.length
      ? botwPool[weekIndex % botwPool.length]
      : null;

    const bookOfTheWeek = botwSource
      ? {
          id: botwSource.id,
          title: botwSource.title || "",
          subtitle: botwSource.subtitle || "",
          description: botwSource.description || "",
          coverUrl: resolveUrl(botwSource.coverUrl),
          backgroundColor: botwSource.backgroundColor || "",
          summaryPageUrls: ((botwSource.summaryPages as { url?: string }[] | null) ?? [])
            .slice(0, 2)
            .map((p) => resolveUrl(p?.url))
            .filter(Boolean),
          // Drives the "Free page" pill. True only when the book really does expose a page
          // anyone can color, so the pill states a fact rather than decorating the card.
          hasFreePage: Boolean(
            botwSource.tryoutPage ||
              (
                (botwSource.coloringPages as { isPublic?: boolean }[] | null) ?? []
              ).some((p) => p?.isPublic),
          ),
        }
      : null;

    // Write to app/home — store payload in `data` Json column
    const payload = {
      categories: categoriesRaw,
      newArrivalBooks,
      trendingBooks,
      bookOfTheWeek,
    };
    await prisma.app.upsert({
      where: { id: "home" },
      create: { id: "home", data: doc as never },
      update: { data: doc as never },
    });

    return NextResponse.json({
      success: true,
      synced: {
        newArrivalBooks: doc.newArrivalBooks.length,
        trendingBooks: doc.trendingBooks.length,
        categories: doc.categories.length,
        freeColoringPages: doc.freeColoringPages.length,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
