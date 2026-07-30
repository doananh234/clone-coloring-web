import { NextRequest, NextResponse } from "next/server";
import { getOperatorFromRequest } from "@/lib/auth/require-operator";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const operator = await getOperatorFromRequest(req);
  if (!operator) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  return NextResponse.json({
    id: operator.sub,
    username: operator.username,
    name: operator.name,
    role: operator.role,
  });
}
