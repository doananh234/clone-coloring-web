import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

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
    const catSnap = await adminDb.collection("categories").orderBy("index").get();
    const categories = catSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        name: d.name || "",
        displayName: d.displayName || "",
        description: d.description || "",
        iconUrl: resolveUrl(d.iconUrl),
        isPublic: d.isPublic ?? true,
        order: d.index ?? 0,
      };
    });

    // Fetch all books
    const bookSnap = await adminDb.collection("books").get();
    const books = bookSnap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((b: Record<string, unknown>) => b.coverUrl);

    // Sort by createdAt DESC for new arrivals
    const sorted = [...books].sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
      const aTime = (a.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
      const bTime = (b.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
      return bTime - aTime;
    });

    const newArrivalBooks = sorted.slice(0, 10).map((b: Record<string, unknown>) => ({
      id: b.id as string,
      title: (b.title as string) || "",
      coverUrl: resolveUrl(b.coverUrl as string),
      price: (b.price as string) || "",
      subtitle: (b.subtitle as string) || "",
    }));

    // Sort by coloring pages count DESC for trending
    const byPages = [...books].sort(
      (a: Record<string, unknown>, b: Record<string, unknown>) =>
        ((b.coloringPages as unknown[])?.length || 0) -
        ((a.coloringPages as unknown[])?.length || 0),
    );

    const trendingBooks = byPages.slice(0, 10).map((b: Record<string, unknown>, i: number) => ({
      id: b.id as string,
      rank: i + 1,
      title: (b.title as string) || "",
      subtitle: (b.subtitle as string) || "",
      imageUrl: resolveUrl(b.coverUrl as string),
      participantCount: String((b.coloringPages as unknown[])?.length || 0),
    }));

    // Write to app/home
    await adminDb.collection("app").doc("home").set({
      categories,
      newArrivalBooks,
      trendingBooks,
      updatedAt: FieldValue.serverTimestamp(),
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
