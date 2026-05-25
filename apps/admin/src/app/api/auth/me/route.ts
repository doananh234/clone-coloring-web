import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "No token" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(token);

    return NextResponse.json({
      id: decoded.uid,
      name: decoded.name || decoded.email?.split("@")[0] || "User",
      email: decoded.email || "",
      avatar: decoded.picture || "",
    });
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}
