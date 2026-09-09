// apps/admin/src/app/api/clone/[jobId]/apply-candidate/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findUnique = vi.fn();
vi.mock("@vx/db", () => ({
  prisma: { cloneJob: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}));

const patchJobPage = vi.fn();
const updateBookPageUrl = vi.fn();
const updateBookPageUrlById = vi.fn();
vi.mock("../reproduce/helpers", () => ({
  patchJobPage: (...a: unknown[]) => patchJobPage(...a),
  updateBookPageUrl: (...a: unknown[]) => updateBookPageUrl(...a),
  updateBookPageUrlById: (...a: unknown[]) => updateBookPageUrlById(...a),
}));

import { POST } from "./route";

// Same shape as the reproduce test: cover + 2 intro pages precede the interiors,
// so book interior index 1 is source page #5, which sits at job index 4.
const jobPages = [
  { pageNumber: 1, pageType: "cover", regenCandidateUrl: "https://r2/c1.png" },
  { pageNumber: 2, pageType: "interiorIntro", regenCandidateUrl: "https://r2/c2.png" },
  { pageNumber: 3, pageType: "interiorIntro", regenCandidateUrl: "https://r2/c3.png" },
  { pageNumber: 4, pageType: "interior", regenCandidateUrl: "https://r2/c4.png" },
  { pageNumber: 5, pageType: "interior", regenCandidateUrl: "https://r2/c5.png" },
];

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/clone/j1/apply-candidate", {
    method: "POST",
    body: JSON.stringify(body),
  });
const params = { params: Promise.resolve({ jobId: "j1" }) };

describe("POST /api/clone/[jobId]/apply-candidate", () => {
  beforeEach(() => {
    findUnique.mockReset();
    patchJobPage.mockReset();
    updateBookPageUrl.mockReset();
    updateBookPageUrlById.mockReset();
    findUnique.mockResolvedValue({ bookId: "b1", pages: jobPages });
    patchJobPage.mockResolvedValue(true);
  });

  it("applies the candidate of the page matching sourcePageNumber", async () => {
    const res = await POST(
      req({ pageIndex: 1, sourcePageNumber: 5, bookPageId: "bp5", kind: "regen" }),
      params,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ url: "https://r2/c5.png" });
    expect(patchJobPage.mock.calls[0][1]).toBe(4);
  });

  it("writes to the book page by id, not by index", async () => {
    await POST(req({ pageIndex: 1, sourcePageNumber: 5, bookPageId: "bp5", kind: "regen" }), params);

    expect(updateBookPageUrlById).toHaveBeenCalledWith("b1", "bp5", "https://r2/c5.png");
    expect(updateBookPageUrl).not.toHaveBeenCalled();
  });

  it("404s when sourcePageNumber matches no job page", async () => {
    const res = await POST(req({ pageIndex: 1, sourcePageNumber: 99, kind: "regen" }), params);

    expect(res.status).toBe(404);
    expect(patchJobPage).not.toHaveBeenCalled();
  });

  it("still indexes by pageIndex when no sourcePageNumber is sent (jobs compare screen)", async () => {
    const res = await POST(req({ pageIndex: 1, kind: "regen" }), params);

    await expect(res.json()).resolves.toMatchObject({ url: "https://r2/c2.png" });
    expect(updateBookPageUrl).toHaveBeenCalledWith("b1", 1, "https://r2/c2.png");
  });
});
