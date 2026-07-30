// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findUnique = vi.fn();
const update = vi.fn();
const del = vi.fn();
const count = vi.fn();
vi.mock("@vx/db", () => ({
  prisma: {
    operator: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => update(...a),
      delete: (...a: unknown[]) => del(...a),
      count: (...a: unknown[]) => count(...a),
    },
  },
}));

import { signSessionToken } from "@/lib/auth/jwt";
import { GET, PATCH, DELETE } from "./route";

async function adminToken() {
  return signSessionToken({ sub: "admin1", username: "admin", role: "admin", name: "Boss" });
}
function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}
function req(method: string, token: string, body?: unknown): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  headers.set("authorization", `Bearer ${token}`);
  return new NextRequest("http://localhost/api/operators/op1", {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const SAMPLE = { id: "op1", username: "joe", name: "Joe", role: "operator", disabled: false, lastLoginAt: null, createdAt: new Date("2026-01-01") };

describe("/api/operators/[id]", () => {
  beforeEach(() => {
    process.env.AUTH_JWT_SECRET = "test-secret";
    findUnique.mockReset();
    update.mockReset();
    del.mockReset();
    count.mockReset();
  });

  it("GET returns 404 for a missing operator", async () => {
    findUnique.mockResolvedValue(null);
    const res = await GET(req("GET", await adminToken()), ctx("op1"));
    expect(res.status).toBe(404);
  });

  it("PATCH updates name", async () => {
    findUnique.mockResolvedValue({ ...SAMPLE });
    update.mockResolvedValue({ ...SAMPLE, name: "Joseph" });
    const res = await PATCH(req("PATCH", await adminToken(), { name: "Joseph" }), ctx("op1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.name).toBe("Joseph");
    expect(json.data.passwordHash).toBeUndefined();
  });

  it("PATCH hashes a password reset", async () => {
    findUnique.mockResolvedValue({ ...SAMPLE });
    update.mockResolvedValue({ ...SAMPLE });
    await PATCH(req("PATCH", await adminToken(), { password: "brandnew" }), ctx("op1"));
    expect(update.mock.calls[0][0].data.passwordHash).toBeDefined();
    expect(update.mock.calls[0][0].data.passwordHash).not.toBe("brandnew");
  });

  it("PATCH blocks disabling the last enabled admin", async () => {
    findUnique.mockResolvedValue({ ...SAMPLE, id: "admin1", role: "admin", disabled: false });
    count.mockResolvedValue(1);
    const res = await PATCH(req("PATCH", await adminToken(), { disabled: true }), ctx("admin1"));
    expect(res.status).toBe(409);
    expect(update).not.toHaveBeenCalled();
  });

  it("DELETE blocks removing the last enabled admin", async () => {
    findUnique.mockResolvedValue({ ...SAMPLE, id: "admin1", role: "admin", disabled: false });
    count.mockResolvedValue(1);
    const res = await DELETE(req("DELETE", await adminToken()), ctx("admin1"));
    expect(res.status).toBe(409);
    expect(del).not.toHaveBeenCalled();
  });

  it("DELETE removes a normal operator", async () => {
    findUnique.mockResolvedValue({ ...SAMPLE });
    del.mockResolvedValue({});
    const res = await DELETE(req("DELETE", await adminToken()), ctx("op1"));
    expect(res.status).toBe(200);
    expect(del).toHaveBeenCalledWith({ where: { id: "op1" } });
  });
});
