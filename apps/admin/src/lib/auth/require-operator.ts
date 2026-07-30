import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, type SessionClaims } from "./jwt";

export type OperatorClaims = SessionClaims;

export async function getOperatorFromRequest(req: NextRequest): Promise<OperatorClaims | null> {
  const authz = req.headers.get("authorization") ?? "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) return null;
  try {
    return await verifySessionToken(token);
  } catch {
    return null;
  }
}

export async function requireOperator(
  req: NextRequest,
): Promise<{ operator: OperatorClaims } | { error: NextResponse }> {
  const operator = await getOperatorFromRequest(req);
  if (!operator) return { error: NextResponse.json({ error: "auth required" }, { status: 401 }) };
  return { operator };
}

export async function requireAdmin(
  req: NextRequest,
): Promise<{ operator: OperatorClaims } | { error: NextResponse }> {
  const res = await requireOperator(req);
  if ("error" in res) return res;
  if (res.operator.role !== "admin") {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return res;
}
