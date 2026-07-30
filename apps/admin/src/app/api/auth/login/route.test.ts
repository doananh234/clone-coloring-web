// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@vx/db", () => ({
  prisma: {
    operator: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => update(...a),
    },
  },
}));

import { hashPassword } from "@/lib/auth/password";
import { POST } from "./route";

function loginReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    process.env.AUTH_JWT_SECRET = "test-secret";
    findUnique.mockReset();
    update.mockReset();
    update.mockResolvedValue({});
  });

  it("returns a token for correct credentials", async () => {
    const passwordHash = await hashPassword("pw123");
    findUnique.mockResolvedValue({ id: "op1", username: "admin", name: "Boss", role: "admin", disabled: false, passwordHash });
    const res = await POST(loginReq({ username: "admin", password: "pw123" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.token).toBe("string");
    expect(json.user).toEqual({ id: "op1", username: "admin", name: "Boss", role: "admin" });
    expect(update).toHaveBeenCalled();
  });

  it("returns 401 for a wrong password", async () => {
    const passwordHash = await hashPassword("pw123");
    findUnique.mockResolvedValue({ id: "op1", username: "admin", name: "Boss", role: "admin", disabled: false, passwordHash });
    const res = await POST(loginReq({ username: "admin", password: "wrong" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 for an unknown user", async () => {
    findUnique.mockResolvedValue(null);
    const res = await POST(loginReq({ username: "ghost", password: "pw" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 for a disabled account", async () => {
    const passwordHash = await hashPassword("pw123");
    findUnique.mockResolvedValue({ id: "op1", username: "admin", name: "Boss", role: "admin", disabled: true, passwordHash });
    const res = await POST(loginReq({ username: "admin", password: "pw123" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for a malformed body", async () => {
    const res = await POST(loginReq({ username: "" }));
    expect(res.status).toBe(400);
  });
});
