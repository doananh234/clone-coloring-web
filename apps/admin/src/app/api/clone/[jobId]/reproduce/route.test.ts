// apps/admin/src/app/api/clone/[jobId]/reproduce/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findUnique = vi.fn();
vi.mock("@vx/db", () => ({
  prisma: { cloneJob: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}));

const generateVariation = vi.fn();
const patchJobPage = vi.fn();
const updateBookPageUrl = vi.fn();
const updateBookPageUrlById = vi.fn();
vi.mock("./helpers", () => ({
  generateVariation: (...a: unknown[]) => generateVariation(...a),
  patchJobPage: (...a: unknown[]) => patchJobPage(...a),
  updateBookPageUrl: (...a: unknown[]) => updateBookPageUrl(...a),
  updateBookPageUrlById: (...a: unknown[]) => updateBookPageUrlById(...a),
}));

vi.mock("@vx/server-core/r2", () => ({
  getR2Config: () => ({}),
  createR2Client: () => ({}),
}));
vi.mock("@vx/server-core/ai/prompts", () => ({
  pickDifferentCameraView: () => "top-down",
}));
vi.mock("@vx/server-core/langfuse", () => ({ flushLangfuse: vi.fn() }));
vi.mock("@vx/coloring/data/page-variants", () => ({
  mirrorUrlToSelectedVariant: (p: unknown) => p,
}));

import { POST } from "./route";

/**
 * A book whose source had a cover + two intro pages before the interiors —
 * exactly the shape create-book produces since page-type classification landed.
 * The book's interior array therefore starts at source page #4:
 *
 *   book.coloringPages[0] -> source #4      cloneJob.pages[0] -> source #1 (cover)
 *   book.coloringPages[1] -> source #5      cloneJob.pages[1] -> source #2 (intro)
 */
const jobPages = [
  { pageNumber: 1, pageType: "cover", imageUrl: "/src/p1-cover.png" },
  { pageNumber: 2, pageType: "interiorIntro", imageUrl: "/src/p2-intro.png" },
  { pageNumber: 3, pageType: "interiorIntro", imageUrl: "/src/p3-intro.png" },
  { pageNumber: 4, pageType: "interior", imageUrl: "/src/p4.png" },
  { pageNumber: 5, pageType: "interior", imageUrl: "/src/p5.png" },
];

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/clone/j1/reproduce", {
    method: "POST",
    body: JSON.stringify(body),
  });
const params = { params: Promise.resolve({ jobId: "j1" }) };

describe("POST /api/clone/[jobId]/reproduce — single page", () => {
  beforeEach(() => {
    findUnique.mockReset();
    generateVariation.mockReset();
    patchJobPage.mockReset();
    updateBookPageUrl.mockReset();
    updateBookPageUrlById.mockReset();
    findUnique.mockResolvedValue({ bookId: "b1", pages: jobPages, bookData: {}, entityMap: {}, name: "j" });
    generateVariation.mockResolvedValue("https://r2/regen.png");
    patchJobPage.mockResolvedValue(undefined);
  });

  it("anchors on the job page matching sourcePageNumber, not on jobPages[pageIndex]", async () => {
    // The book screen sends the interior-array index (1) plus the page's real
    // identity. Index 1 in the JOB array is the intro page #2 — regenerating
    // that is the bug: the user asked for interior #5.
    const res = await POST(
      req({ pageIndex: 1, sourcePageNumber: 5, bookPageId: "bp5", newAngle: false, apply: false }),
      params,
    );

    expect(res.status).toBe(200);
    expect(generateVariation).toHaveBeenCalledTimes(1);
    expect(generateVariation.mock.calls[0][0]).toMatchObject({ sourceImageUrl: "/src/p5.png" });
  });

  it("patches the job page at the resolved job index, not the incoming pageIndex", async () => {
    await POST(req({ pageIndex: 1, sourcePageNumber: 5, apply: false }), params);

    expect(patchJobPage).toHaveBeenCalledTimes(1);
    expect(patchJobPage.mock.calls[0][1]).toBe(4); // source #5 lives at job index 4
  });

  it("writes the applied result to the book page by id, not by index", async () => {
    await POST(req({ pageIndex: 1, sourcePageNumber: 5, bookPageId: "bp5", apply: true }), params);

    expect(updateBookPageUrlById).toHaveBeenCalledWith("b1", "bp5", "https://r2/regen.png");
    expect(updateBookPageUrl).not.toHaveBeenCalled();
  });

  it("404s when sourcePageNumber matches no job page instead of regenerating a random one", async () => {
    const res = await POST(req({ pageIndex: 1, sourcePageNumber: 99, apply: false }), params);

    expect(res.status).toBe(404);
    expect(generateVariation).not.toHaveBeenCalled();
  });

  it("takes the single-page path on the book-screen payload, which carries no pageIndex", async () => {
    // The book screen only knows the page's identity, never a job index — it has
    // always sent sourcePageNumber alone. Gating the single-page path on
    // pageIndex dropped that call into the bulk pending-pages path instead,
    // which returns an empty result set for a finished book; the client then
    // silently redrew from the page's own (already dense) image.
    const res = await POST(req({ sourcePageNumber: 5, bookPageId: "bp5", apply: false }), params);

    expect(res.status).toBe(200);
    expect(generateVariation).toHaveBeenCalledTimes(1);
    expect(generateVariation.mock.calls[0][0]).toMatchObject({ sourceImageUrl: "/src/p5.png" });
  });

  it("passes the caller's changePercent through to the variation", async () => {
    await POST(req({ sourcePageNumber: 5, apply: false, changePercent: 55 }), params);

    expect(generateVariation.mock.calls[0][0]).toMatchObject({ changePercent: 55 });
  });

  it("still indexes by pageIndex when no sourcePageNumber is sent (jobs compare screen)", async () => {
    await POST(req({ pageIndex: 1, apply: false }), params);

    expect(generateVariation.mock.calls[0][0]).toMatchObject({ sourceImageUrl: "/src/p2-intro.png" });
    expect(patchJobPage.mock.calls[0][1]).toBe(1);
  });
});
