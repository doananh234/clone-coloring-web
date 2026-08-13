// apps/admin/src/app/api/coloring-styles/colorize/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@vx/db", () => ({ prisma: {
  coloringStyle: { findUnique: vi.fn().mockResolvedValue({ id: "st1", colorizationDirective: "warm", referenceImages: [], variants: [] }) },
  book: { findUnique: (...a: unknown[]) => findUnique(...a), update: (...a: unknown[]) => update(...a) },
} }));
vi.mock("@vx/server-core/ai/image-provider", () => ({
  colorizeImage: vi.fn().mockResolvedValue({ base64: "AAA", dataUrl: "data:image/png;base64,AAA" }),
}));
vi.mock("@vx/server-core/langfuse", () => ({ flushLangfuse: vi.fn() }));
vi.mock("@vx/server-core/r2", () => ({
  getR2Config: () => ({}), createR2Client: () => ({}),
  uploadToR2: vi.fn().mockResolvedValue({ url: "https://r2/colored.png" }),
  resolveR2Url: (k: string) => `https://r2/${k.replace(/^\//, "")}`,
}));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/coloring-styles/colorize", { method: "POST", body: JSON.stringify(body) }));

describe("colorize target:sourceCover", () => {
  beforeEach(() => { findUnique.mockReset(); update.mockReset(); update.mockResolvedValue({}); });

  it("writes coloredUrl into book.data.sourceCovers, leaving url + coloringPages untouched", async () => {
    findUnique.mockResolvedValue({
      id: "b1", coloringPages: [{ id: "p1", url: "/p1.png" }],
      data: { sourceCovers: [{ id: "sc1", url: "/sc1.png", titleSafe: "top", sourceInteriorId: "p1", createdAt: "x" }] },
    });
    const res = await post({ imageUrl: "/sc1.png", coloringStyleId: "st1", bookId: "b1", pageId: "sc1", target: "sourceCover" });
    expect(res.status).toBe(200);
    const savedData = update.mock.calls[0][0].data;
    expect(savedData.coloringPages).toBeUndefined(); // did not touch coloringPages
    const sc = savedData.data.sourceCovers[0];
    expect(sc.coloredUrl).toContain("https://r2/colored.png");
    expect(sc.url).toBe("/sc1.png"); // B&W preserved
  });
});
