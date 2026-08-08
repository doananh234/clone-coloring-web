// apps/admin/src/app/api/books/[bookId]/approve/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@vx/db", () => ({ prisma: { book: {
  findUnique: (...a: unknown[]) => findUnique(...a),
  update: (...a: unknown[]) => update(...a),
} } }));

const getOperatorFromRequest = vi.fn();
vi.mock("@/lib/auth/require-operator", () => ({
  getOperatorFromRequest: (...a: unknown[]) => getOperatorFromRequest(...a),
}));

import { POST } from "./route";

function post(bookId: string) {
  return POST(
    new NextRequest(`http://localhost/api/books/${bookId}/approve`, { method: "POST" }),
    { params: Promise.resolve({ bookId }) },
  );
}

describe("POST /api/books/[bookId]/approve", () => {
  beforeEach(() => {
    findUnique.mockReset(); update.mockReset();
    getOperatorFromRequest.mockReset();
    update.mockResolvedValue({ id: "b1", isPublic: true, assignedToId: "op-1" });
  });

  it("401 when unauthenticated", async () => {
    getOperatorFromRequest.mockResolvedValue(null);
    const res = await post("b1");
    expect(res.status).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });

  it("404 when the book does not exist", async () => {
    getOperatorFromRequest.mockResolvedValue({ sub: "op-1", role: "member" });
    findUnique.mockResolvedValue(null);
    const res = await post("missing");
    expect(res.status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });

  it("403 when a non-admin operator is not the assignee", async () => {
    getOperatorFromRequest.mockResolvedValue({ sub: "op-2", role: "member" });
    findUnique.mockResolvedValue({ id: "b1", assignedToId: "op-1", isPublic: false });
    const res = await post("b1");
    expect(res.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("approves when the caller is the assignee (isPublic=true, assignment untouched)", async () => {
    getOperatorFromRequest.mockResolvedValue({ sub: "op-1", role: "member" });
    findUnique.mockResolvedValue({ id: "b1", assignedToId: "op-1", isPublic: false });
    const res = await post("b1");
    expect(res.status).toBe(200);
    const arg = update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "b1" });
    expect(arg.data).toEqual({ isPublic: true }); // assignedToId NOT present
  });

  it("approves when the caller is an admin (even if not the assignee)", async () => {
    getOperatorFromRequest.mockResolvedValue({ sub: "admin-9", role: "admin" });
    findUnique.mockResolvedValue({ id: "b1", assignedToId: "op-1", isPublic: false });
    const res = await post("b1");
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledTimes(1);
  });
});
