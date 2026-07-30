import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findUnique = vi.fn();
const update = vi.fn();
const del = vi.fn();

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
  prisma: {
    coverTextOverlay: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => update(...a),
      delete: (...a: unknown[]) => del(...a),
    },
  },
  Prisma: { PrismaClientKnownRequestError: MockPrismaClientKnownRequestError },
}));

import { GET, PATCH, DELETE } from "./route";

describe("/api/cover-text-overlays/[id]", () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
    del.mockReset();
  });

  it("GET returns the row", async () => {
    findUnique.mockResolvedValue({ id: "o1", name: "Style A", elements: {} });
    const res = await GET(new NextRequest("http://localhost/api/cover-text-overlays/o1"), {
      params: Promise.resolve({ id: "o1" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe("o1");
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "o1" } });
  });

  it("GET returns 404 when not found", async () => {
    findUnique.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/cover-text-overlays/missing"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("PATCH updates name/elements", async () => {
    const elements = { title: { font: "Poppins" } };
    update.mockResolvedValue({ id: "o1", name: "New Name", elements });
    const res = await PATCH(
      new NextRequest("http://localhost/api/cover-text-overlays/o1", {
        method: "PATCH",
        body: JSON.stringify({ name: "New Name", elements }),
      }),
      { params: Promise.resolve({ id: "o1" }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ id: "o1", name: "New Name", elements });
    expect(update).toHaveBeenCalledWith({ where: { id: "o1" }, data: { name: "New Name", elements } });
  });

  it("PATCH returns 404 when not found", async () => {
    update.mockRejectedValue(new MockPrismaClientKnownRequestError("Record not found", "P2025"));
    const res = await PATCH(
      new NextRequest("http://localhost/api/cover-text-overlays/missing", {
        method: "PATCH",
        body: JSON.stringify({ name: "X" }),
      }),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(res.status).toBe(404);
  });

  it("PATCH rejects empty body", async () => {
    const res = await PATCH(
      new NextRequest("http://localhost/api/cover-text-overlays/o1", {
        method: "PATCH",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "o1" }) },
    );
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("DELETE removes the row", async () => {
    del.mockResolvedValue({ id: "o1" });
    const res = await DELETE(new NextRequest("http://localhost/api/cover-text-overlays/o1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "o1" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true });
    expect(del).toHaveBeenCalledWith({ where: { id: "o1" } });
  });

  it("DELETE returns 404 when not found", async () => {
    del.mockRejectedValue(new MockPrismaClientKnownRequestError("Record not found", "P2025"));
    const res = await DELETE(new NextRequest("http://localhost/api/cover-text-overlays/missing", { method: "DELETE" }), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });
});
