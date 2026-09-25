import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findUnique = vi.fn();
const bookCreate = vi.fn();
const jobUpdate = vi.fn();
vi.mock("@vx/db", () => ({
  prisma: {
    cloneJob: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => jobUpdate(...a),
    },
    book: { create: (...a: unknown[]) => bookCreate(...a) },
  },
}));
const movePage = vi.fn(async ({ bookId, pageIndex }: { bookId: string; pageIndex: number }) =>
  `/assets/${bookId}/pages/page-${pageIndex + 1}.png`);
const moveCover = vi.fn(async ({ bookId }: { sourceUrl: string; bookId: string }) =>
  `/assets/${bookId}/cover.png`);
vi.mock("@/lib/move-clone-page-to-book", () => ({
  moveCloneJobImageToBook: (a: never) => movePage(a),
  moveCloneJobCoverToBook: (a: never) => moveCover(a),
}));
vi.mock("./extract-source-style", () => ({
  extractSourceStyleFromCover: vi.fn(async () => ({
    coloringStyleId: null, coloringVariantId: null, coverStylePack: null,
  })),
}));
vi.mock("../../source-tags", () => ({ readSourceTags: vi.fn(async () => ({})) }));

import { POST } from "./route";

const call = () =>
  POST(new NextRequest("http://localhost/api/clone/j1/create-book", { method: "POST", body: "{}" }), {
    params: Promise.resolve({ jobId: "j1" }),
  } as never);

describe("POST /api/clone/[jobId]/create-book — cover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bookCreate.mockImplementation(async ({ data }: { data: { id: string } }) => ({ id: data.id }));
  });

  it("uses the source cover page's original image as the book cover", async () => {
    findUnique.mockResolvedValue({
      id: "j1", name: "Book", bookId: null, bookData: {},
      pages: [
        { pageNumber: 1, imageUrl: "/assets/clone-jobs/j1/p1.png", pageType: "cover" },
        { pageNumber: 2, imageUrl: "/assets/clone-jobs/j1/p2.png", pageType: "interior" },
      ],
    });

    const res = await call();
    expect(res.status).toBe(200);

    expect(moveCover).toHaveBeenCalledWith(
      expect.objectContaining({ sourceUrl: "/assets/clone-jobs/j1/p1.png" }),
    );
    const data = bookCreate.mock.calls[0][0].data;
    expect(data.coverUrl).toBe(`/assets/${data.id}/cover.png`);
    expect(data.thumbnailUrl).toBe(data.coverUrl);
    expect(data.squareThumbnailUrl).toBe(data.coverUrl);
  });

  it("leaves the cover empty when no page has an image", async () => {
    findUnique.mockResolvedValue({ id: "j1", name: "Book", bookId: null, bookData: {}, pages: [] });

    await call();
    expect(moveCover).not.toHaveBeenCalled();
    expect(bookCreate.mock.calls[0][0].data.coverUrl ?? null).toBeNull();
  });
});
