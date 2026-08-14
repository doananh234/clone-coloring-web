// apps/admin/src/app/api/books/[bookId]/source-covers/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@vx/db", () => ({ prisma: { book: {
  findUnique: (...a: unknown[]) => findUnique(...a),
  update: (...a: unknown[]) => update(...a),
} } }));

const generateCoverSourceBW = vi.fn();
vi.mock("@vx/server-core/ai", () => ({
  generateCoverSourceBW: (...a: unknown[]) => generateCoverSourceBW(...a),
}));

vi.mock("@vx/server-core/r2", () => ({
  getR2Config: () => ({}),
  createR2Client: () => ({}),
  uploadToR2: vi.fn().mockResolvedValue({ url: "https://r2/sc.png" }),
  resolveR2Url: (k: string) => `https://r2/${k.replace(/^\//, "")}`,
}));

import { POST, PATCH } from "./route";

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/books/b1/source-covers", {
    method: "POST", body: JSON.stringify(body),
  });
const params = { params: Promise.resolve({ bookId: "b1" }) };

describe("POST /api/books/[bookId]/source-covers", () => {
  beforeEach(() => {
    findUnique.mockReset(); update.mockReset(); generateCoverSourceBW.mockReset();
    generateCoverSourceBW.mockResolvedValue({ base64: "AAA", dataUrl: "data:image/png;base64,AAA" });
    update.mockResolvedValue({});
  });

  it("404 when the interior page is not in the book", async () => {
    findUnique.mockResolvedValue({ id: "b1", coloringPages: [{ id: "other", url: "/p.png" }], data: {} });
    const res = await POST(req({ interiorPageId: "nope", titleSafe: "top" }), params);
    expect(res.status).toBe(404);
    expect(generateCoverSourceBW).not.toHaveBeenCalled();
  });

  it("generates a B&W source cover and appends it to book.data.sourceCovers", async () => {
    findUnique.mockResolvedValue({ id: "b1", coloringPages: [{ id: "p1", url: "/p1.png" }], data: {} });
    const res = await POST(req({ interiorPageId: "p1", titleSafe: "bottom" }), params);
    expect(res.status).toBe(200);
    // called with the resolved interior url + the requested title-safe position
    expect(generateCoverSourceBW).toHaveBeenCalledWith("https://r2/p1.png", "bottom", expect.any(Object));
    const saved = update.mock.calls[0][0].data.data.sourceCovers;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ titleSafe: "bottom", sourceInteriorId: "p1", url: "https://r2/sc.png" });
    const json = await res.json();
    expect(json.sourceCover.titleSafe).toBe("bottom");
  });
});

describe("PATCH /api/books/[bookId]/source-covers", () => {
  beforeEach(() => { findUnique.mockReset(); update.mockReset(); update.mockResolvedValue({}); });
  it("toggles isPublic on the target source cover", async () => {
    findUnique.mockResolvedValue({ id: "b1", data: { sourceCovers: [{ id: "s1", url: "/s.png", isPublic: false }] } });
    const patchReq = new NextRequest("http://localhost/api/books/b1/source-covers", {
      method: "PATCH", body: JSON.stringify({ scId: "s1", isPublic: true }),
    });
    const res = await PATCH(patchReq, params);
    expect(res.status).toBe(200);
    expect(update.mock.calls[0][0].data.data.sourceCovers[0].isPublic).toBe(true);
  });
});
