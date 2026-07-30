import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const count = vi.fn();
const findMany = vi.fn();
const bookFindUnique = vi.fn();
const bookUpdate = vi.fn();

vi.mock("@vx/db", () => ({
  prisma: {
    cloneJob: {
      count: (...a: unknown[]) => count(...a),
      findMany: (...a: unknown[]) => findMany(...a),
    },
    book: {
      findUnique: (...a: unknown[]) => bookFindUnique(...a),
      update: (...a: unknown[]) => bookUpdate(...a),
    },
  },
}));

vi.mock("@vx/server-core/ai/llm-provider", () => ({
  visionAnalyzeJSON: vi.fn(),
}));
vi.mock("@vx/server-core/text-overlay", () => ({
  FONT_CATALOG: [
    { id: "fredoka", family: "Fredoka", weights: [400, 700] },
    { id: "inter", family: "Inter", weights: [400, 700] },
  ],
}));
vi.mock("@vx/server-core/ai/prompts/cover-design-prompt", () => ({
  buildCoverDesignPrompt: () => ({ systemPrompt: "s", userPrompt: "u" }),
}));
vi.mock("@vx/server-core/r2", () => ({
  resolveR2Url: (url: string) => url,
}));

import { POST } from "./route";
import { visionAnalyzeJSON } from "@vx/server-core/ai/llm-provider";

const FAKE_PACK = {
  elements: {
    title: { present: true, fontFamily: "Fredoka", color: "#000" },
  },
};

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/clone/backfill-cover-overlays", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/clone/backfill-cover-overlays", () => {
  beforeEach(() => {
    count.mockReset();
    findMany.mockReset();
    bookFindUnique.mockReset();
    bookUpdate.mockReset();
    (visionAnalyzeJSON as ReturnType<typeof vi.fn>).mockReset();
  });

  it("dryRun default (empty body) returns job list without calling AI", async () => {
    count.mockResolvedValue(2);
    findMany.mockResolvedValue([
      { id: "job1", resultBookId: "book1", name: "Job One", pages: [{ imageUrl: "https://r2/a.png" }] },
      { id: "job2", resultBookId: "book2", name: "Job Two", pages: [] },
    ]);

    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.dryRun).toBe(true);
    expect(json.total).toBe(2);
    expect(json.jobs).toEqual([
      { jobId: "job1", bookId: "book1", name: "Job One", hasSource: true },
      { jobId: "job2", bookId: "book2", name: "Job Two", hasSource: false },
    ]);
    expect(visionAnalyzeJSON).not.toHaveBeenCalled();
    expect(bookUpdate).not.toHaveBeenCalled();
  });

  it("dryRun:false extracts from pages[0].imageUrl and merges into book.data.coverStylePack without clobbering", async () => {
    count.mockResolvedValue(1);
    findMany.mockResolvedValue([
      {
        id: "job1",
        resultBookId: "book1",
        name: "Job One",
        pages: [{ imageUrl: "https://r2/original-cover.png?x=1" }],
      },
    ]);
    bookFindUnique.mockResolvedValue({
      title: "My Book",
      subtitle: "Sub",
      category: "animals",
      data: { existingKey: "keepme", coverStylePack: { old: true } },
    });
    (visionAnalyzeJSON as ReturnType<typeof vi.fn>).mockResolvedValueOnce(FAKE_PACK);
    bookUpdate.mockResolvedValue({ id: "book1" });

    const res = await POST(makeReq({ dryRun: false }));
    expect(res.status).toBe(200);
    const json = await res.json();

    // extraction called with the resolved ORIGINAL source cover (query stripped)
    const visionMock = visionAnalyzeJSON as ReturnType<typeof vi.fn>;
    expect(visionMock).toHaveBeenCalledOnce();
    expect(visionMock.mock.calls[0][0]).toBe("https://r2/original-cover.png");

    // merge preserves other data keys, overwrites coverStylePack
    expect(bookUpdate).toHaveBeenCalledOnce();
    expect(bookUpdate.mock.calls[0][0]).toEqual({
      where: { id: "book1" },
      data: {
        data: {
          existingKey: "keepme",
          coverStylePack: FAKE_PACK,
        },
      },
    });

    expect(json.dryRun).toBe(false);
    expect(json.ok).toBe(1);
    expect(json.results[0]).toEqual({
      jobId: "job1",
      bookId: "book1",
      status: "ok",
      titlePresent: true,
    });
  });

  it("job with no pages[0].imageUrl is skipped without calling AI", async () => {
    count.mockResolvedValue(1);
    findMany.mockResolvedValue([
      { id: "job1", resultBookId: "book1", name: "No Source", pages: [] },
    ]);

    const res = await POST(makeReq({ dryRun: false }));
    const json = await res.json();

    expect(visionAnalyzeJSON).not.toHaveBeenCalled();
    expect(bookUpdate).not.toHaveBeenCalled();
    expect(json.skipped).toBe(1);
    expect(json.results[0]).toEqual({
      jobId: "job1",
      bookId: "book1",
      status: "skipped",
      reason: "no source image",
    });
  });

  it("continues processing remaining jobs when one job's extraction throws", async () => {
    count.mockResolvedValue(2);
    findMany.mockResolvedValue([
      { id: "job1", resultBookId: "book1", name: "Fails", pages: [{ imageUrl: "https://r2/a.png" }] },
      { id: "job2", resultBookId: "book2", name: "Succeeds", pages: [{ imageUrl: "https://r2/b.png" }] },
    ]);
    bookFindUnique.mockResolvedValue({
      title: "Book",
      subtitle: null,
      category: null,
      data: {},
    });
    (visionAnalyzeJSON as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("vision failed"))
      .mockResolvedValueOnce(FAKE_PACK);
    bookUpdate.mockResolvedValue({ id: "book2" });

    const res = await POST(makeReq({ dryRun: false }));
    const json = await res.json();

    expect(json.processed).toBe(2);
    expect(json.failed).toBe(1);
    expect(json.ok).toBe(1);
    expect(json.results[0]).toEqual({
      jobId: "job1",
      bookId: "book1",
      status: "error",
      error: "vision failed",
    });
    expect(json.results[1].status).toBe("ok");
    expect(bookUpdate).toHaveBeenCalledOnce();
  });

  it("jobIds filter passes id: { in } into the where clause", async () => {
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([]);

    await POST(makeReq({ jobIds: ["j1", "j2"] }));

    expect(count).toHaveBeenCalledWith({
      where: { resultBookId: { not: null }, id: { in: ["j1", "j2"] } },
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { resultBookId: { not: null }, id: { in: ["j1", "j2"] } },
      }),
    );
  });
});
