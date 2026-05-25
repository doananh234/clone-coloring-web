import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { textPrompt, buildSubtitlePrompt } from "@/lib/ai";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;

  try {
    const doc = await adminDb.collection("books").doc(bookId).get();
    if (!doc.exists) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }
    const book = doc.data()!;

    const prompt = buildSubtitlePrompt(book.title, book.description);
    const subtitle = await textPrompt(prompt, { maxTokens: 50, temperature: 0.7 });

    // Save to Firestore
    await adminDb.collection("books").doc(bookId).update({
      subtitle,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ bookId, subtitle });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
