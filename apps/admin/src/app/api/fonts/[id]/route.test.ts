import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const del = vi.fn();
const update = vi.fn();

/** Mirrors @prisma/client's PrismaClientKnownRequestError shape so `instanceof` checks in the route hold. */
const { MockPrismaClientKnownRequestError } = vi.hoisted(() => {
  class MockPrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  }
  return { MockPrismaClientKnownRequestError };
});

vi.mock("@vx/db", () => ({
  prisma: { font: { delete: (...a: unknown[]) => del(...a), update: (...a: unknown[]) => update(...a) } },
  Prisma: { PrismaClientKnownRequestError: MockPrismaClientKnownRequestError },
}));

import { DELETE, PATCH } from "./route";

describe("/api/fonts/[id]", () => {
  beforeEach(() => {
    del.mockReset();
    update.mockReset();
  });

  it("DELETE removes a font", async () => {
    del.mockResolvedValue({ id: "f1" });
    const res = await DELETE(new NextRequest("http://localhost/api/fonts/f1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "f1" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true });
    expect(del).toHaveBeenCalledWith({ where: { id: "f1" } });
  });

  it("DELETE returns 404 when font does not exist", async () => {
    del.mockRejectedValue(new MockPrismaClientKnownRequestError("Record not found", "P2025"));
    const res = await DELETE(new NextRequest("http://localhost/api/fonts/missing", { method: "DELETE" }), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Không tìm thấy font");
  });

  it("PATCH renames a font", async () => {
    update.mockResolvedValue({ id: "f1", name: "New Name" });
    const res = await PATCH(
      new NextRequest("http://localhost/api/fonts/f1", { method: "PATCH", body: JSON.stringify({ name: "New Name" }) }),
      { params: Promise.resolve({ id: "f1" }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, font: { id: "f1", name: "New Name" } });
    expect(update).toHaveBeenCalledWith({ where: { id: "f1" }, data: { name: "New Name" } });
  });

  it("PATCH rejects missing name", async () => {
    const res = await PATCH(new NextRequest("http://localhost/api/fonts/f1", { method: "PATCH", body: JSON.stringify({}) }), {
      params: Promise.resolve({ id: "f1" }),
    });
    expect(res.status).toBe(400);
  });

  it("PATCH returns 404 when font does not exist", async () => {
    update.mockRejectedValue(new MockPrismaClientKnownRequestError("Record not found", "P2025"));
    const res = await PATCH(
      new NextRequest("http://localhost/api/fonts/missing", { method: "PATCH", body: JSON.stringify({ name: "X" }) }),
      { params: Promise.resolve({ id: "missing" }) }
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Không tìm thấy font");
  });
});
