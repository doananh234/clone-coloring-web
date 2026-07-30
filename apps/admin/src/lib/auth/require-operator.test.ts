// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { signSessionToken } from "./jwt";
import { requireOperator, requireAdmin } from "./require-operator";

function reqWith(token?: string): NextRequest {
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  return new NextRequest("http://localhost/api/x", { headers });
}

describe("require-operator guards", () => {
  beforeEach(() => {
    process.env.AUTH_JWT_SECRET = "test-secret";
  });

  it("requireOperator returns 401 when no token", async () => {
    const res = await requireOperator(reqWith());
    expect("error" in res && res.error.status).toBe(401);
  });

  it("requireOperator returns claims for a valid token", async () => {
    const token = await signSessionToken({ sub: "op1", username: "u", role: "operator", name: "N" });
    const res = await requireOperator(reqWith(token));
    expect("operator" in res && res.operator.sub).toBe("op1");
  });

  it("requireAdmin returns 403 for a non-admin token", async () => {
    const token = await signSessionToken({ sub: "op1", username: "u", role: "operator", name: "N" });
    const res = await requireAdmin(reqWith(token));
    expect("error" in res && res.error.status).toBe(403);
  });

  it("requireAdmin returns claims for an admin token", async () => {
    const token = await signSessionToken({ sub: "op1", username: "u", role: "admin", name: "N" });
    const res = await requireAdmin(reqWith(token));
    expect("operator" in res && res.operator.role).toBe("admin");
  });
});
