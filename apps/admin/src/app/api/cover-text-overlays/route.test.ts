import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const create = vi.fn();
const findMany = vi.fn();
const count = vi.fn();
vi.mock("@vx/db", () => ({
  prisma: {
    coverTextOverlay: {
      create: (...a: unknown[]) => create(...a),
      findMany: (...a: unknown[]) => findMany(...a),
      count: (...a: unknown[]) => count(...a),
    },
  },
}));

import { GET, POST } from "./route";

describe("/api/cover-text-overlays", () => {
  beforeEach(() => {
    create.mockReset();
    findMany.mockReset();
    count.mockReset();
  });

  it("GET returns paginated list", async () => {
    findMany.mockResolvedValue([{ id: "o1", name: "Style A", elements: {} }]);
    count.mockResolvedValue(1);
    const res = await GET(new NextRequest("http://localhost/api/cover-text-overlays"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
    expect(findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      skip: 0,
      take: 20,
    });
  });

  it("GET respects page/limit query params", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(45);
    const res = await GET(new NextRequest("http://localhost/api/cover-text-overlays?page=2&limit=10"));
    const json = await res.json();
    expect(json.meta).toEqual({ total: 45, page: 2, limit: 10, totalPages: 5 });
    expect(findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      skip: 10,
      take: 10,
    });
  });

  it("POST rejects missing name", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/cover-text-overlays", {
        method: "POST",
        body: JSON.stringify({ elements: { title: {} } }),
      }),
    );
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("POST creates a row with elements passed through as-is", async () => {
    const elements = { title: { font: "Poppins", weight: 700, color: "#fff", align: "center" } };
    create.mockResolvedValue({ id: "o9", name: "Style A", elements, referenceImageUrl: null });
    const res = await POST(
      new NextRequest("http://localhost/api/cover-text-overlays", {
        method: "POST",
        body: JSON.stringify({ name: "Style A", elements, referenceImageUrl: "https://example.com/ref.png" }),
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe("o9");
    expect(create).toHaveBeenCalledWith({
      data: { name: "Style A", elements, referenceImageUrl: "https://example.com/ref.png" },
    });
  });

  it("POST defaults elements to {} when absent", async () => {
    create.mockResolvedValue({ id: "o10", name: "Style B", elements: {} });
    const res = await POST(
      new NextRequest("http://localhost/api/cover-text-overlays", {
        method: "POST",
        body: JSON.stringify({ name: "Style B" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledWith({
      data: { name: "Style B", elements: {}, referenceImageUrl: null },
    });
  });
});
