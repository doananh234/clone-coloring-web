import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET() {
  try {
    const snap = await adminDb.collection("characters").orderBy("name").get();
    const characters = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ data: characters });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
