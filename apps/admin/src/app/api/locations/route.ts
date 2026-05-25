import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET() {
  try {
    const snap = await adminDb.collection("locations").orderBy("name").get();
    const locations = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ data: locations });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
