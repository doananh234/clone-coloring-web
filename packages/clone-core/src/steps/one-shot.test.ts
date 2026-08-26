import { describe, it, expect, vi } from "vitest";
import { stepOneShot } from "./one-shot";

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

describe("stepOneShot with a trimmed PDF", () => {
  const jobPages = [
    { pageNumber: 1, imageUrl: "/p1.png", status: "pending", pageType: "cover" },
    { pageNumber: 2, imageUrl: "/p2.png", status: "pending", pageType: "interior", excludedFromClone: true },
    { pageNumber: 3, imageUrl: "/p3.png", status: "pending", pageType: "interior" },
  ];

  const twoPageDeps = () => ({
    ...fakeDeps(),
    runOneShot: vi.fn().mockResolvedValue({
      sessionId: "sess-1",
      pages: [
        { redesignedImageUrl: "https://cdn/r-a.png", analyzeData: { reproductionPrompt: "a" } },
        { redesignedImageUrl: "https://cdn/r-b.png", analyzeData: { reproductionPrompt: "b" } },
      ],
    }),
  });

  it("sends the trimmed PDF, not the original", async () => {
    const { db } = fakeDb({
      id: "job-1",
      sourcePdfUrl: "/source.pdf",
      pages: jobPages,
      data: { trimmedPdfUrl: "/source-trimmed.pdf", keptPageNumbers: [1, 3] },
      bookData: {},
    });
    const deps = twoPageDeps();
    await stepOneShot(fakeCtx("job-1"), db, deps);
    // resolveR2Url (mocked as `https://r2${key}`) is applied to the trimmed
    // PDF's relative R2 key, same as it would be to sourcePdfUrl — proving
    // the trimmed key was sent, not "/source.pdf".
    expect(deps.runOneShot).toHaveBeenCalledWith(
      "https://r2/source-trimmed.pdf",
      "job-1",
      undefined,
    );
  });

  it("maps Diaflow output back onto original page numbers", async () => {
    const { db, updates } = fakeDb({
      id: "job-1",
      sourcePdfUrl: "/source.pdf",
      pages: jobPages,
      data: { trimmedPdfUrl: "/source-trimmed.pdf", keptPageNumbers: [1, 3] },
      bookData: {},
    });
    await stepOneShot(fakeCtx("job-1"), db, twoPageDeps());
    const written = updates.find((u) => Array.isArray((u as { pages?: unknown }).pages)) as { pages: Array<Record<string, unknown>> };
    const byNumber = Object.fromEntries(written.pages.map((p) => [p.pageNumber, p]));
    expect(byNumber[1].redesignedUrl).toBeTruthy();
    expect(byNumber[3].redesignedUrl).toBeTruthy();
    expect(byNumber[1].imageUrl).toBe("/p1.png");
    expect(byNumber[3].imageUrl).toBe("/p3.png");
  });

  it("leaves the dropped page in job.pages with its original image and no redesign", async () => {
    const { db, updates } = fakeDb({
      id: "job-1",
      sourcePdfUrl: "/source.pdf",
      pages: jobPages,
      data: { trimmedPdfUrl: "/source-trimmed.pdf", keptPageNumbers: [1, 3] },
      bookData: {},
    });
    await stepOneShot(fakeCtx("job-1"), db, twoPageDeps());
    const written = updates.find((u) => Array.isArray((u as { pages?: unknown }).pages)) as { pages: Array<Record<string, unknown>> };
    expect(written.pages).toHaveLength(3);
    const dropped = written.pages.find((p) => p.pageNumber === 2)!;
    expect(dropped.imageUrl).toBe("/p2.png");
    expect(dropped.redesignedUrl).toBeUndefined();
    expect(dropped.excludedFromClone).toBe(true);
  });

  it("preserves the operator's pageType instead of re-deriving it", async () => {
    const { db, updates } = fakeDb({
      id: "job-1",
      sourcePdfUrl: "/source.pdf",
      pages: jobPages,
      data: { trimmedPdfUrl: "/source-trimmed.pdf", keptPageNumbers: [1, 3] },
      bookData: {},
    });
    await stepOneShot(fakeCtx("job-1"), db, twoPageDeps());
    const written = updates.find((u) => Array.isArray((u as { pages?: unknown }).pages)) as { pages: Array<Record<string, unknown>> };
    const byNumber = Object.fromEntries(written.pages.map((p) => [p.pageNumber, p]));
    expect(byNumber[1].pageType).toBe("cover");
    expect(byNumber[3].pageType).toBe("interior");
  });

  it("short-circuits without calling runOneShot when all kept pages are already done, even though the dropped page never got a redesign", async () => {
    const { db } = fakeDb({
      id: "job-1",
      sourcePdfUrl: "/source.pdf",
      pages: [
        {
          pageNumber: 1,
          imageUrl: "/p1.png",
          status: "reproduced",
          pageType: "cover",
          redesignedUrl: "https://r2/r1.png",
        },
        // Dropped page: no redesignedUrl, excluded from clone. Under the old,
        // unscoped allDone check this would fail `.every()` and force a full
        // (expensive) re-run every time. It must stay this way for this test
        // to be a real regression guard.
        { pageNumber: 2, imageUrl: "/p2.png", status: "pending", pageType: "interior", excludedFromClone: true },
        {
          pageNumber: 3,
          imageUrl: "/p3.png",
          status: "reproduced",
          pageType: "interior",
          redesignedUrl: "https://r2/r3.png",
        },
      ],
      data: { trimmedPdfUrl: "/source-trimmed.pdf", keptPageNumbers: [1, 3] },
      bookData: {},
    });
    const ctx = fakeCtx("job-1");
    const deps = twoPageDeps();

    await stepOneShot(ctx, db, deps);

    expect(deps.runOneShot).not.toHaveBeenCalled();
    expect(ctx.markStepComplete).toHaveBeenCalledWith("reproduce");
  });
});

describe("stepOneShot — SourceBook cache alignment", () => {
  // A cache is only reusable if it was produced under the SAME kept-page set.
  // Otherwise `originalPageNumber(i) = keptPageNumbers[i]` attributes every
  // result after the first divergence to the wrong original page — no error,
  // no warning, just shifted artwork.
  function cacheDb(
    job: Record<string, unknown>,
    sbData: Record<string, unknown>,
  ) {
    const updates: Record<string, unknown>[] = [];
    const sourceBookUpdates: Record<string, unknown>[] = [];
    return {
      updates,
      sourceBookUpdates,
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
          findUnique: vi.fn().mockResolvedValue({ id: "sb-1", data: sbData }),
          update: vi.fn().mockImplementation(async (arg: { data: { data: unknown } }) => {
            sourceBookUpdates.push(arg.data.data as Record<string, unknown>);
          }),
        },
        brand: { findFirst: vi.fn().mockResolvedValue(null) },
      } as never,
    };
  }

  const fourPageCache = [
    { redesignedImageUrl: "https://cdn/c-1.png", analyzeData: { reproductionPrompt: "1" } },
    { redesignedImageUrl: "https://cdn/c-2.png", analyzeData: { reproductionPrompt: "2" } },
    { redesignedImageUrl: "https://cdn/c-3.png", analyzeData: { reproductionPrompt: "3" } },
    { redesignedImageUrl: "https://cdn/c-4.png", analyzeData: { reproductionPrompt: "4" } },
  ];

  const jobWithKept = (keptPageNumbers: number[]) => ({
    id: "job-c",
    sourcePdfUrl: "/source.pdf",
    pages: [
      { pageNumber: 1, imageUrl: "/p1.png", status: "pending", pageType: "cover" },
      { pageNumber: 2, imageUrl: "/p2.png", status: "pending", pageType: "interior" },
      { pageNumber: 3, imageUrl: "/p3.png", status: "pending", pageType: "interior" },
      { pageNumber: 4, imageUrl: "/p4.png", status: "pending", pageType: "interior" },
    ],
    data: { trimmedPdfUrl: "/source-trimmed.pdf", keptPageNumbers },
    bookData: {},
  });

  it("discards a cache produced under a different kept-page set", async () => {
    // Cache covers the full 4-page book; the job has since been trimmed to [1, 3].
    const { db } = cacheDb(jobWithKept([1, 3]), {
      oneShotSessionId: "sess-old",
      oneShotPages: fourPageCache,
      oneShotKeptPageNumbers: [1, 2, 3, 4],
    });
    const deps = {
      ...fakeDeps(),
      runOneShot: vi.fn().mockResolvedValue({
        sessionId: "sess-new",
        pages: [
          { redesignedImageUrl: "https://cdn/n-1.png", analyzeData: { reproductionPrompt: "n1" } },
          { redesignedImageUrl: "https://cdn/n-3.png", analyzeData: { reproductionPrompt: "n3" } },
        ],
      }),
    };

    await stepOneShot(fakeCtx("job-c", "sb-1"), db, deps);

    expect(deps.runOneShot).toHaveBeenCalledTimes(1);
  });

  it("discards a legacy cache that recorded no kept-page set at all", async () => {
    const { db } = cacheDb(jobWithKept([1, 3]), {
      oneShotSessionId: "sess-old",
      oneShotPages: fourPageCache,
    });
    const deps = {
      ...fakeDeps(),
      runOneShot: vi.fn().mockResolvedValue({
        sessionId: "sess-new",
        pages: [
          { redesignedImageUrl: "https://cdn/n-1.png", analyzeData: {} },
          { redesignedImageUrl: "https://cdn/n-3.png", analyzeData: {} },
        ],
      }),
    };

    await stepOneShot(fakeCtx("job-c", "sb-1"), db, deps);

    expect(deps.runOneShot).toHaveBeenCalledTimes(1);
  });

  it("reuses a cache whose recorded kept-page set matches", async () => {
    const { db, updates } = cacheDb(jobWithKept([1, 3]), {
      oneShotSessionId: "sess-old",
      oneShotPages: [fourPageCache[0], fourPageCache[2]],
      oneShotKeptPageNumbers: [1, 3],
    });
    const deps = { ...fakeDeps(), runOneShot: vi.fn() };

    await stepOneShot(fakeCtx("job-c", "sb-1"), db, deps);

    expect(deps.runOneShot).not.toHaveBeenCalled();
    const written = updates.find((u) => Array.isArray((u as { pages?: unknown }).pages)) as {
      pages: Array<Record<string, unknown>>;
    };
    const byNumber = Object.fromEntries(written.pages.map((p) => [p.pageNumber, p]));
    expect((byNumber[1].rawData as { reproductionPrompt: string }).reproductionPrompt).toBe("1");
    expect((byNumber[3].rawData as { reproductionPrompt: string }).reproductionPrompt).toBe("3");
  });

  it("records the kept-page set alongside the cache it writes", async () => {
    const { db, sourceBookUpdates } = cacheDb(jobWithKept([1, 3]), {});
    const deps = {
      ...fakeDeps(),
      runOneShot: vi.fn().mockResolvedValue({
        sessionId: "sess-new",
        pages: [
          { redesignedImageUrl: "https://cdn/n-1.png", analyzeData: {} },
          { redesignedImageUrl: "https://cdn/n-3.png", analyzeData: {} },
        ],
      }),
    };

    await stepOneShot(fakeCtx("job-c", "sb-1"), db, deps);

    expect(sourceBookUpdates[0].oneShotKeptPageNumbers).toEqual([1, 3]);
    expect(sourceBookUpdates[0].oneShotSessionId).toBe("sess-new");
  });

  it("still reuses a legacy cache on a legacy job that has no kept-page set", async () => {
    const { db } = cacheDb(
      {
        id: "job-c",
        sourcePdfUrl: "/source.pdf",
        pages: [
          { pageNumber: 1, imageUrl: "/p1.png", status: "pending" },
          { pageNumber: 2, imageUrl: "/p2.png", status: "pending" },
        ],
        data: null,
        bookData: {},
      },
      {
        oneShotSessionId: "sess-old",
        oneShotPages: [fourPageCache[0], fourPageCache[1]],
      },
    );
    const deps = { ...fakeDeps(), runOneShot: vi.fn() };

    await stepOneShot(fakeCtx("job-c", "sb-1"), db, deps);

    expect(deps.runOneShot).not.toHaveBeenCalled();
  });
});

describe("stepOneShot — index map safety", () => {
  const jobPages = [
    { pageNumber: 1, imageUrl: "/p1.png", status: "pending", pageType: "cover" },
    { pageNumber: 2, imageUrl: "/p2.png", status: "pending", pageType: "interior", excludedFromClone: true },
    { pageNumber: 3, imageUrl: "/p3.png", status: "pending", pageType: "interior" },
  ];

  // Regression: `keptPageNumbers?.[i] ?? i + 1` silently fell back to identity
  // for indices past the end of the map, so a provider returning MORE pages
  // than were sent collided with a real page number and overwrote a correct
  // page's redesignedUrl/rawData.
  it("drops provider results past the end of keptPageNumbers instead of guessing", async () => {
    const { db, updates } = fakeDb({
      id: "job-1",
      sourcePdfUrl: "/source.pdf",
      pages: jobPages,
      data: { trimmedPdfUrl: "/source-trimmed.pdf", keptPageNumbers: [1, 3] },
      bookData: {},
    });
    const deps = {
      ...fakeDeps(),
      runOneShot: vi.fn().mockResolvedValue({
        sessionId: "sess-1",
        pages: [
          { redesignedImageUrl: "https://cdn/r-a.png", analyzeData: { reproductionPrompt: "a" } },
          { redesignedImageUrl: "https://cdn/r-b.png", analyzeData: { reproductionPrompt: "b" } },
          // Third result: only two pages were sent. There is no original page
          // this belongs to.
          { redesignedImageUrl: "https://cdn/r-c.png", analyzeData: { reproductionPrompt: "c" } },
        ],
      }),
      uploadToR2: vi
        .fn()
        .mockImplementation(async ({ key }: { key: string }) => ({ url: `https://r2/${key}` })),
    };

    await stepOneShot(fakeCtx("job-1"), db, deps);

    const written = updates.find((u) => Array.isArray((u as { pages?: unknown }).pages)) as {
      pages: Array<Record<string, unknown>>;
    };
    expect(written.pages).toHaveLength(3);
    const byNumber = Object.fromEntries(written.pages.map((p) => [p.pageNumber, p]));
    // Page 3 keeps ITS result (index 1 -> "b"), not the orphan third result.
    expect((byNumber[3].rawData as { reproductionPrompt: string }).reproductionPrompt).toBe("b");
    expect(byNumber[3].redesignedUrl).toBe(
      "https://r2/assets/clone-jobs/job-1/redesigned/page-003.png",
    );
    // Only the two mapped pages were uploaded — the orphan never hit R2.
    expect(deps.uploadToR2).toHaveBeenCalledTimes(2);
  });

  it("keeps the legacy identity fallback when keptPageNumbers is absent", async () => {
    const { db, updates } = fakeDb({
      id: "job-legacy",
      sourcePdfUrl: "/source.pdf",
      pages: [
        { pageNumber: 1, imageUrl: "/p1.png", status: "pending" },
        { pageNumber: 2, imageUrl: "/p2.png", status: "pending" },
      ],
      data: null,
      bookData: {},
    });
    const deps = {
      ...fakeDeps(),
      runOneShot: vi.fn().mockResolvedValue({
        sessionId: "sess-1",
        pages: [
          { redesignedImageUrl: "https://cdn/r-a.png", analyzeData: { reproductionPrompt: "a" } },
          { redesignedImageUrl: "https://cdn/r-b.png", analyzeData: { reproductionPrompt: "b" } },
        ],
      }),
    };

    await stepOneShot(fakeCtx("job-legacy"), db, deps);

    const written = updates.find((u) => Array.isArray((u as { pages?: unknown }).pages)) as {
      pages: Array<Record<string, unknown>>;
    };
    expect(written.pages.map((p) => p.pageNumber)).toEqual([1, 2]);
    expect(written.pages.every((p) => p.redesignedUrl)).toBe(true);
  });
});
