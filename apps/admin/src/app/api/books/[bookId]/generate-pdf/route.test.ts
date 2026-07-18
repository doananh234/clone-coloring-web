import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@vx/server-core/r2", () => ({
  getR2Config: vi.fn().mockReturnValue({}),
  createR2Client: vi.fn().mockReturnValue({}),
  resolveR2Url: vi.fn((url: string) => (url.startsWith("http") ? url : `https://r2.example.com${url}`)),
  uploadToR2: vi.fn().mockResolvedValue({ url: "/assets/b1/book.pdf" }),
}));
vi.mock("@vx/db", () => ({
  prisma: {
    book: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

import { POST } from "./route";
import { uploadToR2 } from "@vx/server-core/r2";
import { prisma } from "@vx/db";

// Minimal valid 1x1 PNG (square) — used as fetch response bytes.
const PNG_1X1 = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a4944415478da6360000002000155bfaba50000000049454e44ae426082",
  "hex",
);

function mockFetchOk(bytes: Buffer) {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

function req() {
  return new NextRequest("http://localhost/api/books/b1/generate-pdf", { method: "POST" });
}

const params = { params: Promise.resolve({ bookId: "b1" }) };

describe("POST /api/books/[bookId]/generate-pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.book.update as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    global.fetch = vi.fn().mockResolvedValue(mockFetchOk(PNG_1X1));
  });

  it("returns 404 when the book does not exist", async () => {
    (prisma.book.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const res = await POST(req(), params);
    expect(res.status).toBe(404);
  });

  it("returns 400 when there is no cover and no coloring pages", async () => {
    (prisma.book.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "b1",
      coverUrl: "",
      coloringPages: [],
    });
    const res = await POST(req(), params);
    expect(res.status).toBe(400);
  });

  it("includes the cover as the first embedded page, before the coloring pages", async () => {
    (prisma.book.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "b1",
      coverUrl: "/assets/b1/cover.png",
      coloringPages: [{ id: "p1", url: "/assets/b1/pages/page-001.png" }],
    });

    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pageCount).toBe(2);

    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls[0][0]).toContain("cover.png");
    expect(fetchMock.mock.calls[1][0]).toContain("page-001.png");
  });

  it("sizes each PDF page to the source image's native dimensions (square art -> square 1:1 pages)", async () => {
    (prisma.book.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "b1",
      coverUrl: "",
      coloringPages: [{ id: "p1", url: "/assets/b1/pages/page-001.png" }],
    });

    const res = await POST(req(), params);
    expect(res.status).toBe(200);

    const uploadedPdfBytes = (uploadToR2 as ReturnType<typeof vi.fn>).mock.calls[0][0].body as Buffer;
    const { PDFDocument } = await import("pdf-lib");
    // Uint8Array.from() re-materializes the bytes under this realm's
    // Uint8Array constructor — pdf-lib's `instanceof Uint8Array` check on a
    // raw Node Buffer fails cross-realm under Vitest's test environment.
    const savedDoc = await PDFDocument.load(Uint8Array.from(uploadedPdfBytes));
    const page = savedDoc.getPage(0);
    const { width, height } = page.getSize();
    // Our fixture PNG is 1x1 — the page must match it exactly (no fixed
    // Letter-size canvas, no forced margins).
    expect(width).toBe(1);
    expect(height).toBe(1);
  });

  it("skips a page that fails to fetch but still generates the PDF from the rest", async () => {
    (prisma.book.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "b1",
      coverUrl: "",
      coloringPages: [
        { id: "bad", url: "/assets/b1/pages/page-001.png" },
        { id: "good", url: "/assets/b1/pages/page-002.png" },
      ],
    });
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce(mockFetchOk(PNG_1X1));

    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pageCount).toBe(1);
    expect(body.warnings).toEqual(expect.arrayContaining([expect.stringContaining("bad")]));
  });
});
