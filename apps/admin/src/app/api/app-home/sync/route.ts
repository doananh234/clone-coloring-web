import { NextResponse } from "next/server";
import { prisma } from "@vx/db";

const R2_PUBLIC_BASE_URL =
  process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || process.env.R2_PUBLIC_BASE_URL || "";

function resolveUrl(url: string | undefined): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (R2_PUBLIC_BASE_URL) {
    return `${R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  }
  return url;
}

export async function POST() {
  try {
    // Fetch all categories
    const categoriesRaw = await prisma.category.findMany({
      orderBy: { index: "asc" },
    });
    const categories = categoriesRaw.map((d) => ({
      id: d.id,
      name: d.name || "",
      displayName: d.displayName || "",
      description: d.description || "",
      iconUrl: resolveUrl(d.iconUrl || undefined),
      isPublic: d.isPublic ?? true,
      order: d.index ?? 0,
    }));

    // Fetch all books with cover
    const booksRaw = await prisma.book.findMany();
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

    // Write to app/home — store payload in `data` Json column
    const payload = {
      categories,
      newArrivalBooks,
      trendingBooks,
    };
    await prisma.app.upsert({
      where: { id: "home" },
      create: { id: "home", data: payload },
      update: { data: payload },
    });

    return NextResponse.json({
      success: true,
      synced: {
        categories: categories.length,
        newArrivalBooks: newArrivalBooks.length,
        trendingBooks: trendingBooks.length,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
