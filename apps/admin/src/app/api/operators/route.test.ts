// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findMany = vi.fn();
const create = vi.fn();
const findUnique = vi.fn();
vi.mock("@vx/db", () => ({
  prisma: {
    operator: {
      findMany: (...a: unknown[]) => findMany(...a),
      create: (...a: unknown[]) => create(...a),
      findUnique: (...a: unknown[]) => findUnique(...a),
    },
  },
}));

import { signSessionToken } from "@/lib/auth/jwt";
import { GET, POST } from "./route";

async function adminToken() {
  return signSessionToken({ sub: "admin1", username: "admin", role: "admin", name: "Boss" });
}
async function operatorToken() {
  return signSessionToken({ sub: "op2", username: "joe", role: "operator", name: "Joe" });
}
function req(method: string, token?: string, body?: unknown): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("authorization", `Bearer ${token}`);
  return new NextRequest("http://localhost/api/operators", {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("/api/operators", () => {
  beforeEach(() => {
    process.env.AUTH_JWT_SECRET = "test-secret";
    findMany.mockReset();
    create.mockReset();
    findUnique.mockReset();
  });

  it("GET returns 403 for a non-admin", async () => {
    const res = await GET(req("GET", await operatorToken()));
    expect(res.status).toBe(403);
  });

  it("GET lists operators without passwordHash", async () => {
    findMany.mockResolvedValue([
      { id: "op1", username: "admin", name: "Boss", role: "admin", disabled: false, lastLoginAt: null, createdAt: new Date("2026-01-01") },
    ]);
    const res = await GET(req("GET", await adminToken()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data[0].passwordHash).toBeUndefined();
    expect(json.data[0].username).toBe("admin");
  });

  it("POST creates an operator", async () => {
    findUnique.mockResolvedValue(null);
    create.mockResolvedValue({ id: "op9", username: "newbie", name: "New", role: "operator", disabled: false, lastLoginAt: null, createdAt: new Date("2026-01-02") });
    const res = await POST(req("POST", await adminToken(), { username: "newbie", name: "New", password: "pw12345", role: "operator" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.username).toBe("newbie");
    expect(json.data.passwordHash).toBeUndefined();
    expect(create.mock.calls[0][0].data.passwordHash).not.toBe("pw12345");
  });

  it("POST returns 409 on duplicate username", async () => {
    findUnique.mockResolvedValue({ id: "op1", username: "newbie" });
    const res = await POST(req("POST", await adminToken(), { username: "newbie", name: "New", password: "pw12345", role: "operator" }));
    expect(res.status).toBe(409);
  });

  it("POST returns 400 on a bad body", async () => {
    const res = await POST(req("POST", await adminToken(), { username: "x" }));
    expect(res.status).toBe(400);
  });
});
