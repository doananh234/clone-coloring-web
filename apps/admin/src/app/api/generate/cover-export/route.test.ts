import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@vx/server-core/r2", () => ({
  getR2Config: vi.fn().mockReturnValue({}),
  createR2Client: vi.fn().mockReturnValue({}),
  uploadToR2: vi
    .fn()
    .mockResolvedValue({ url: "https://r2.example.com/assets/books/b1/cover.png" }),
}));
vi.mock("@vx/server-core/cover-generation", () => ({
  generateAiCover: vi.fn().mockResolvedValue({
    url: "https://r2.example.com/assets/books/b1/cover-ai.png?v=1",
    base64: Buffer.from("ai-generated-bytes").toString("base64"),
  }),
}));
vi.mock("@vx/db", () => ({
  prisma: {
    book: {
      findUnique: vi.fn(),
    },
  },
}));

import { POST } from "./route";
import { uploadToR2 } from "@vx/server-core/r2";
import { generateAiCover } from "@vx/server-core/cover-generation";
import { prisma } from "@vx/db";

const CLIENT_PNG_BASE64 = Buffer.from("client-rendered-bytes").toString("base64");

describe("POST /api/generate/cover-export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.book.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "b1" });
  });

  it("returns 400 when bookId is missing", async () => {
    const req = new NextRequest("http://localhost/api/generate/cover-export", {
      method: "POST",
      body: JSON.stringify({ imageBase64: CLIENT_PNG_BASE64 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when imageBase64 is missing (non-AI mode)", async () => {
    const req = new NextRequest("http://localhost/api/generate/cover-export", {
      method: "POST",
      body: JSON.stringify({ bookId: "b1" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when backgroundImageUrl is missing in AI mode", async () => {
    const req = new NextRequest("http://localhost/api/generate/cover-export", {
      method: "POST",
      body: JSON.stringify({ bookId: "b1", aiBlend: true, brandName: "iroly" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 when bookId does not exist", async () => {
    (prisma.book.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost/api/generate/cover-export", {
      method: "POST",
      body: JSON.stringify({ bookId: "nonexistent", imageBase64: CLIENT_PNG_BASE64 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  it("client-rendered mode: uploads decoded PNG bytes to R2 (no generateAiCover call)", async () => {
    const req = new NextRequest("http://localhost/api/generate/cover-export", {
      method: "POST",
      body: JSON.stringify({
        bookId: "b1",
        imageBase64: `data:image/png;base64,${CLIENT_PNG_BASE64}`,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toContain("https://r2.example.com/assets/books/b1/cover.png");
    expect(body.url).toContain("?v=");
    expect(generateAiCover).not.toHaveBeenCalled();
    expect(uploadToR2).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "assets/books/b1/cover.png",
        contentType: "image/png",
      }),
    );
    const uploadedBuf = (uploadToR2 as ReturnType<typeof vi.fn>).mock.calls[0][0].body as Buffer;
    expect(uploadedBuf.toString()).toBe("client-rendered-bytes");
  });

  it("AI mode: delegates to generateAiCover with clean bg url + brand + book-scoped R2 key", async () => {
    const req = new NextRequest("http://localhost/api/generate/cover-export", {
      method: "POST",
      body: JSON.stringify({
        bookId: "b1",
        backgroundImageUrl: "https://r2/clean.png",
        aiBlend: true,
        brandName: "iroly",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(generateAiCover).toHaveBeenCalledWith(
      expect.objectContaining({
        cleanImageUrl: "https://r2/clean.png",
        brandName: "iroly",
        r2Key: "assets/books/b1/cover-ai.png",
      }),
    );
    // Non-AI upload path must NOT run when aiBlend=true (shared module owns upload)
    expect(uploadToR2).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.url).toContain("cover-ai.png");
  });

  it("returns 500 when generateAiCover throws in AI mode", async () => {
    (generateAiCover as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("model error"));
    const req = new NextRequest("http://localhost/api/generate/cover-export", {
      method: "POST",
      body: JSON.stringify({
        bookId: "b1",
        backgroundImageUrl: "https://r2/x.png",
        aiBlend: true,
        brandName: "iroly",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
