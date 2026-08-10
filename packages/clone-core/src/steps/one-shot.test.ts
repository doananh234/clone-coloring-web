import { describe, it, expect, vi } from "vitest";
import { stepOneShot } from "./one-shot";
import { classifyPage } from "./classify-page";

function fakeCtx(jobId: string, sourceBookId?: string) {
  return {
    jobId,
    sourceBookId,
    isDone: vi.fn().mockReturnValue(false),
    markStepComplete: vi.fn().mockResolvedValue(undefined),
  } as never;
}

function fakeDb(job: Record<string, unknown>) {
  const updates: Record<string, unknown>[] = [];
  return {
    updates,
    db: {
      cloneJob: {
        findUnique: vi.fn().mockResolvedValue(job),
        update: vi.fn().mockImplementation(async (arg: { data: unknown }) => {
          updates.push({ kind: "update", ...(arg.data as object) });
        }),
        updateMany: vi.fn().mockImplementation(async (arg: { data: unknown }) => {
          updates.push({ kind: "updateMany", ...(arg.data as object) });
        }),
      },
      sourceBook: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(undefined),
      },
      brand: { findFirst: vi.fn().mockResolvedValue(null) },
    } as never,
  };
}

const fakeDeps = () => ({
  runOneShot: vi.fn().mockResolvedValue({
    sessionId: "sess-1",
    pages: [
      {
        redesignedImageUrl: "https://cdn/redesigned-1.png",
        originalImageUrl: "https://cdn/original-1.png",
        analyzeData: {
          scene: { description: "s1", cameraView: "wide", composition: "c" },
          environment: { timeOfDay: "day", weather: "sun", season: "n", mood: "peaceful" },
          characters: [{ name: "Cat" }],
          locations: [{ name: "Room" }],
          props: [],
          reproductionPrompt: "prompt",
          // NEW fields from Diaflow that stepOneShot must preserve:
          titleCover: "My Cover",
          subtitle: "My Sub",
          isCover: true,
          isBW: false,
          visualDna: { shapeLanguage: "round" },
        },
      },
    ],
  }),
  fetchImage: vi.fn().mockResolvedValue({ body: Buffer.from(""), contentType: "image/png" }),
  uploadToR2: vi.fn().mockResolvedValue({ url: "https://r2/redesigned.png" }),
  resolveR2Url: vi.fn().mockImplementation((k: string) => `https://r2${k}`),
});

describe("stepOneShot — preserves full analyzeData", () => {
  it("keeps every field the Diaflow LLM emitted (titleCover, subtitle, isCover, isBW, visualDna)", async () => {
    const job = {
      id: "j1",
      sourcePdfUrl: "/pdf.pdf",
      pages: [{ pageNumber: 1, imageUrl: "https://r2/original-1.png", status: "rendered" }],
      data: null,
    };
    const { db, updates } = fakeDb(job);
    const ctx = fakeCtx("j1");
    const deps = fakeDeps();

    await stepOneShot(ctx, db, deps);

    // Find the updateMany that wrote `pages`
    const pagesUpdate = updates.find(
      (u) => u.kind === "updateMany" && (u as { pages?: unknown }).pages,
    ) as { pages: Array<{ rawData: Record<string, unknown> }> };

    expect(pagesUpdate).toBeDefined();
    const raw = pagesUpdate.pages[0].rawData;
    // Existing fields still present
    expect(raw.scene).toEqual({ description: "s1", cameraView: "wide", composition: "c" });
    expect(raw.characters).toEqual([{ name: "Cat" }]);
    expect(raw.reproductionPrompt).toBe("prompt");
    // NEW: preserved fields
    expect(raw.titleCover).toBe("My Cover");
    expect(raw.subtitle).toBe("My Sub");
    expect(raw.isCover).toBe(true);
    expect(raw.isBW).toBe(false);
    expect(raw.visualDna).toEqual({ shapeLanguage: "round" });
  });

  it("still fills fallbacks when Diaflow omits known fields", async () => {
    const job = {
      id: "j2",
      sourcePdfUrl: "/pdf.pdf",
      pages: [{ pageNumber: 1, imageUrl: "https://r2/x.png", status: "rendered" }],
      data: null,
    };
    const { db, updates } = fakeDb(job);
    const ctx = fakeCtx("j2");
    const deps = fakeDeps();
    deps.runOneShot.mockResolvedValueOnce({
      sessionId: "sess-2",
      pages: [
        {
          redesignedImageUrl: "https://cdn/x.png",
          analyzeData: {}, // completely empty analyze data
        },
      ],
    });

    await stepOneShot(ctx, db, deps);
    const pagesUpdate = updates.find(
      (u) => u.kind === "updateMany" && (u as { pages?: unknown }).pages,
    ) as { pages: Array<{ rawData: Record<string, unknown> }> };
    const raw = pagesUpdate.pages[0].rawData;
    expect(raw.scene).toEqual({ description: "", cameraView: "wide", composition: "" });
    expect(raw.characters).toEqual([]);
    expect(raw.reproductionPrompt).toBe("");
  });
});

describe("stepOneShot — extracts book-level cover meta", () => {
  it("populates bookData.titleCover + .subtitle from the isCover page", async () => {
    const job = {
      id: "j-cover-1",
      sourcePdfUrl: "/pdf.pdf",
      pages: [
        { pageNumber: 1, imageUrl: "https://r2/p1.png", status: "rendered" },
        { pageNumber: 2, imageUrl: "https://r2/p2.png", status: "rendered" },
      ],
      bookData: { title: "Existing Title" },
      data: null,
    };
    const { db, updates } = fakeDb(job);
    const ctx = fakeCtx("j-cover-1");
    const deps = fakeDeps();
    deps.runOneShot.mockResolvedValueOnce({
      sessionId: "sess-c",
      pages: [
        {
          redesignedImageUrl: "https://cdn/p1.png",
          analyzeData: { scene: {}, characters: [], isCover: false, isBW: true },
        },
        {
          redesignedImageUrl: "https://cdn/p2.png",
          analyzeData: {
            scene: {},
            characters: [],
            isCover: true,
            isBW: false,
            titleCover: "Peaceful Haven Moments",
            subtitle: "Relaxing illustrations for mindful coloring",
          },
        },
      ],
    });

    await stepOneShot(ctx, db, deps);

    // Find the bookData update
    const bookDataUpdate = updates.find(
      (u) => (u as { bookData?: unknown }).bookData,
    ) as { bookData: Record<string, unknown> };
    expect(bookDataUpdate).toBeDefined();
    expect(bookDataUpdate.bookData.title).toBe("Existing Title"); // preserved
    expect(bookDataUpdate.bookData.titleCover).toBe("Peaceful Haven Moments");
    expect(bookDataUpdate.bookData.subtitle).toBe("Relaxing illustrations for mindful coloring");
  });

  it("does NOT overwrite user-set titleCover/subtitle in bookData", async () => {
    const job = {
      id: "j-cover-2",
      sourcePdfUrl: "/pdf.pdf",
      pages: [{ pageNumber: 1, imageUrl: "https://r2/p1.png", status: "rendered" }],
      bookData: { title: "T", titleCover: "USER OVERRIDE", subtitle: "USER SUB" },
      data: null,
    };
    const { db, updates } = fakeDb(job);
    const ctx = fakeCtx("j-cover-2");
    const deps = fakeDeps();
    deps.runOneShot.mockResolvedValueOnce({
      sessionId: "sess-c2",
      pages: [
        {
          redesignedImageUrl: "https://cdn/p1.png",
          analyzeData: {
            isCover: true,
            titleCover: "Diaflow Title",
            subtitle: "Diaflow Sub",
          },
        },
      ],
    });

    await stepOneShot(ctx, db, deps);

    // Should have bookData in updates (pages write may not contain it if no change)
    // Check that updateMany was called with the user values preserved
    const coverUpdate = updates.find(
      (u) => (u as { bookData?: unknown }).bookData,
    ) as { bookData?: Record<string, unknown> } | undefined;
    // If no cover update found, verify user values were already there and not overwritten
    if (coverUpdate) {
      expect(coverUpdate.bookData?.titleCover).toBe("USER OVERRIDE");
      expect(coverUpdate.bookData?.subtitle).toBe("USER SUB");
    }
  });

  it("skips extraction when no page has isCover: true", async () => {
    const job = {
      id: "j-cover-3",
      sourcePdfUrl: "/pdf.pdf",
      pages: [{ pageNumber: 1, imageUrl: "https://r2/p1.png", status: "rendered" }],
      bookData: { title: "T" },
      data: null,
    };
    const { db, updates } = fakeDb(job);
    const ctx = fakeCtx("j-cover-3");
    const deps = fakeDeps();
    deps.runOneShot.mockResolvedValueOnce({
      sessionId: "sess-c3",
      pages: [
        {
          redesignedImageUrl: "https://cdn/p1.png",
          analyzeData: { isCover: false, isBW: true },
        },
      ],
    });

    await stepOneShot(ctx, db, deps);

    const bookDataUpdate = updates.find(
      (u) => (u as { bookData?: unknown }).bookData,
    );
    expect(bookDataUpdate).toBeUndefined(); // no bookData write
  });
});

describe("stepOneShot — D2 auto-classify", () => {
  it("writes pageType=cover on the isCover page and interior elsewhere", async () => {
    // Arrange: a 3-page one-shot result where page 2 is the LLM cover.
    const pagesOut: unknown[] = [];
    const db = {
      cloneJob: {
        findUnique: vi.fn().mockResolvedValue({
          id: "j1",
          sourcePdfUrl: "assets/clone-jobs/j1/src.pdf",
          data: {},
          bookData: {},
          pages: [
            { pageNumber: 1, imageUrl: "o1", status: "rendered" },
            { pageNumber: 2, imageUrl: "o2", status: "rendered" },
            { pageNumber: 3, imageUrl: "o3", status: "rendered" },
          ],
        }),
        update: vi.fn().mockResolvedValue(undefined),
        updateMany: vi.fn().mockImplementation(async (arg: { data?: { pages?: unknown[] } }) => {
          if (arg.data?.pages) pagesOut.splice(0, pagesOut.length, ...arg.data.pages);
        }),
      },
      sourceBook: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
      brand: { findFirst: vi.fn().mockResolvedValue(null) },
    } as never;

    const ctx = {
      jobId: "j1",
      sourceBookId: undefined,
      isDone: () => false,
      markStepComplete: vi.fn().mockResolvedValue(undefined),
    } as never;

    const deps = {
      runOneShot: vi.fn().mockResolvedValue({
        sessionId: "s1",
        pages: [
          { redesignedImageUrl: "r1", analyzeData: { isCover: false } },
          { redesignedImageUrl: "r2", analyzeData: { isCover: true } },
          { redesignedImageUrl: "r3", analyzeData: { isCover: false } },
        ],
      }),
      fetchImage: vi.fn().mockResolvedValue({ body: Buffer.from(""), contentType: "image/png" }),
      uploadToR2: vi.fn().mockResolvedValue({ url: "https://r2/red.png" }),
      resolveR2Url: (k: string) => `https://r2/${k}`,
    };

    await stepOneShot(ctx, db, deps);

    const written = pagesOut as Array<{ pageNumber: number; pageType?: string }>;
    expect(written.find((p) => p.pageNumber === 2)?.pageType).toBe("cover");
    expect(written.find((p) => p.pageNumber === 1)?.pageType).toBe("interior");
    expect(written.find((p) => p.pageNumber === 3)?.pageType).toBe("interior");
    // sanity: helper agrees
    expect(classifyPage({ pageNumber: 2, isCover: true }).pageType).toBe("cover");
  });

  it("maps Diaflow isIntro/isInterior signals to interiorIntro/interior", async () => {
    const pagesOut: unknown[] = [];
    const db = {
      cloneJob: {
        findUnique: vi.fn().mockResolvedValue({
          id: "j2",
          sourcePdfUrl: "assets/clone-jobs/j2/src.pdf",
          data: {},
          bookData: {},
          pages: [
            { pageNumber: 1, imageUrl: "o1", status: "rendered" },
            { pageNumber: 2, imageUrl: "o2", status: "rendered" },
            { pageNumber: 3, imageUrl: "o3", status: "rendered" },
            { pageNumber: 4, imageUrl: "o4", status: "rendered" },
          ],
        }),
        update: vi.fn().mockResolvedValue(undefined),
        updateMany: vi.fn().mockImplementation(async (arg: { data?: { pages?: unknown[] } }) => {
          if (arg.data?.pages) pagesOut.splice(0, pagesOut.length, ...arg.data.pages);
        }),
      },
      sourceBook: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
      brand: { findFirst: vi.fn().mockResolvedValue(null) },
    } as never;

    const ctx = {
      jobId: "j2",
      sourceBookId: undefined,
      isDone: () => false,
      markStepComplete: vi.fn().mockResolvedValue(undefined),
    } as never;

    const deps = {
      runOneShot: vi.fn().mockResolvedValue({
        sessionId: "s2",
        pages: [
          { redesignedImageUrl: "r1", analyzeData: { isCover: true } },
          { redesignedImageUrl: "r2", analyzeData: { isIntro: true } },
          { redesignedImageUrl: "r3", analyzeData: { isInterior: true } },
          { redesignedImageUrl: "r4", analyzeData: {} }, // no signal → interior (cover already assigned)
        ],
      }),
      fetchImage: vi.fn().mockResolvedValue({ body: Buffer.from(""), contentType: "image/png" }),
      uploadToR2: vi.fn().mockResolvedValue({ url: "https://r2/red.png" }),
      resolveR2Url: (k: string) => `https://r2/${k}`,
    };

    await stepOneShot(ctx, db, deps);

    const written = pagesOut as Array<{ pageNumber: number; pageType?: string }>;
    expect(written.find((p) => p.pageNumber === 1)?.pageType).toBe("cover");
    expect(written.find((p) => p.pageNumber === 2)?.pageType).toBe("interiorIntro");
    expect(written.find((p) => p.pageNumber === 3)?.pageType).toBe("interior");
    expect(written.find((p) => p.pageNumber === 4)?.pageType).toBe("interior");
  });
});
