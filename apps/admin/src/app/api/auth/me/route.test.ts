// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { signSessionToken } from "@/lib/auth/jwt";
import { GET } from "./route";

function meReq(token?: string): NextRequest {
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  return new NextRequest("http://localhost/api/auth/me", { headers });
}

describe("GET /api/auth/me", () => {
  beforeEach(() => {
    process.env.AUTH_JWT_SECRET = "test-secret";
  });

  it("returns 401 without a token", async () => {
    const res = await GET(meReq());
    expect(res.status).toBe(401);
  });

  it("returns the operator profile for a valid token", async () => {
    const token = await signSessionToken({ sub: "op1", username: "admin", role: "admin", name: "Boss" });
    const res = await GET(meReq(token));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ id: "op1", username: "admin", name: "Boss", role: "admin" });
  });
});
