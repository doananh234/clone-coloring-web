import { NextRequest, NextResponse } from "next/server";
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { categoryId } = body as {
      bookId?: string;
      categoryId?: string;
    };

    if (!categoryId) {
      return NextResponse.json({ error: "categoryId required" }, { status: 400 });
    }

    // Get all books in this category
    const booksSnap = await adminDb
      .collection("books")
      .where("categoryId", "==", categoryId)
      .orderBy("title")
      .get();

    const bookSummaries = booksSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        title: d.title || "",
        coverUrl: resolveUrl(d.coverUrl),
        price: d.price || "",
        badge: d.badge || "",
        order: 0,
      };
    });

    // Update category's books array
    await adminDb.collection("categories").doc(categoryId).update({
      books: bookSummaries,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      categoryId,
      bookCount: bookSummaries.length,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
