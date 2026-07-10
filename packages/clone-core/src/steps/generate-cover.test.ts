import { describe, it, expect, vi } from "vitest";
import { stepGenerateCover } from "./generate-cover";

function fakeCtx(jobId: string, resultBookId: string) {
  return {
    jobId,
    resultBookId,
    markStepComplete: vi.fn().mockResolvedValue(undefined),
  } as never;
}

const OK_BRAND = {
  id: "b1",
  name: "Cozy",
  data: { coloringStyleId: "cs1", displayName: "Cozy Brand" },
};

const OK_STYLE = {
  id: "cs1",
  name: "Watercolor",
  colorizationDirective: "watercolor style",
  referenceImages: [],
};

const OK_BOOK = {
  id: "book1",
  title: "MyBook",
  subtitle: "SubDefault",
  coverUrl: "/fallback.png",
  thumbnailUrl: "/fallback.png",
  squareThumbnailUrl: "/fallback.png",
  data: {},
  bookData: { title: "MyBook", titleCover: "My Cover", subtitle: "My Sub" },
  coloringPages: [
    { id: "p1", url: "/pages/1.png" },
    { id: "p2", url: "/pages/2.png" }, // middle for 4 pages → floor(4/2)=2, 1-indexed page 2 → coloringPages[1]
    { id: "p3", url: "/pages/3.png" },
    { id: "p4", url: "/pages/4.png" },
  ],
};

function makeDb() {
  const bookUpdates: Array<Record<string, unknown>> = [];
  return {
    bookUpdates,
    db: {
      cloneJob: {
        findUnique: vi.fn().mockResolvedValue({
          id: "j1",
          data: { brandId: "b1" },
          bookData: OK_BOOK.bookData,
          resultBookId: "book1",
        }),
      },
      brand: {
        findUnique: vi.fn().mockResolvedValue(OK_BRAND),
        findFirst: vi.fn().mockResolvedValue(OK_BRAND),
      },
      coloringStyle: {
        findUnique: vi.fn().mockResolvedValue(OK_STYLE),
        // Random-style pick: return one usable style so Math.random picks it.
        findMany: vi.fn().mockResolvedValue([OK_STYLE]),
      },
      book: {
        findUnique: vi.fn().mockResolvedValue(OK_BOOK),
        update: vi.fn().mockImplementation(async (arg: { data: Record<string, unknown> }) => {
          bookUpdates.push(arg.data);
        }),
      },
    } as never,
  };
}

function makeDeps() {
  return {
    colorizeImage: vi.fn().mockResolvedValue({
      base64: Buffer.from("colorized").toString("base64"),
      dataUrl: "data:image/png;base64,Y29sb3JpemVk",
    }),
    generateAiCover: vi.fn().mockResolvedValue({
      url: "https://r2/cover/cover-ai.png?v=1",
      base64: Buffer.from("ai-generated").toString("base64"),
    }),
    uploadToR2: vi
      .fn()
      // stepGenerateCover uploads the colorized thumbnail; generateAiCover
      // owns the final cover upload internally.
      .mockResolvedValueOnce({ url: "https://r2/cover/thumbnail.png" }),
    resolveR2Url: (k: string) => `https://r2${k.startsWith("/") ? k : "/" + k}`,
  };
}

describe("stepGenerateCover — happy path", () => {
  it("colorizes middle page, delegates AI cover, writes URLs + coverMeta", async () => {
    const { db, bookUpdates } = makeDb();
    const ctx = fakeCtx("j1", "book1");
    const deps = makeDeps();

    await stepGenerateCover(ctx, db, deps);

    // Middle page: 4 pages → floor(4/2)=2, 1-indexed page 2 → coloringPages[1]
    expect(deps.colorizeImage).toHaveBeenCalledWith(
      "https://r2/pages/2.png",
      "watercolor style",
      { referenceImageUrls: [] },
    );
    // Shared module owns the AI blend + upload of the final cover.
    expect(deps.generateAiCover).toHaveBeenCalledTimes(1);
    const aiCall = deps.generateAiCover.mock.calls[0][0] as {
      cleanImageUrl: string;
      brandName: string;
      titleHint?: string;
      subtitleHint?: string;
      r2Key: string;
    };
    expect(aiCall.cleanImageUrl).toBe("https://r2/cover/thumbnail.png");
    expect(aiCall.brandName).toBe("Cozy Brand");
    expect(aiCall.titleHint).toBe("My Cover");
    expect(aiCall.subtitleHint).toBe("My Sub");
    expect(aiCall.r2Key).toBe("assets/clone-jobs/j1/cover/cover-ai.png");
    // Only the thumbnail upload happens inside the step; the AI cover upload
    // lives in generateAiCover.
    expect(deps.uploadToR2).toHaveBeenCalledTimes(1);

    const update = bookUpdates[0];
    expect(update.coverUrl).toBe("https://r2/cover/cover-ai.png?v=1");
    expect(update.thumbnailUrl).toBe("https://r2/cover/thumbnail.png");
    expect(update.squareThumbnailUrl).toBe("https://r2/cover/thumbnail.png");
    const meta = (update.data as { coverMeta: Record<string, unknown> }).coverMeta;
    expect(meta.status).toBe("generated");
    expect(meta.titleCover).toBe("My Cover");
    expect(meta.subtitle).toBe("My Sub");
    expect(meta.brandId).toBe("b1");
    expect(meta.coloringStyleId).toBe("cs1");
    expect(meta.middlePageIndex).toBe(2);
    expect(meta.sourceThumbnailUrl).toBe("https://r2/cover/thumbnail.png");
    expect(ctx.markStepComplete).toHaveBeenCalledWith("generate-cover");
  });
});

describe("stepGenerateCover — failure paths", () => {
  it("throws + marks coverMeta.status=failed when NO ColoringStyle rows have a directive", async () => {
    // New behavior: cover generation now picks a random style from all rows
    // with a non-empty colorizationDirective — brand's coloringStyleId is no
    // longer required. We only fail when the DB has zero usable styles.
    const { db, bookUpdates } = makeDb();
    (db as { coloringStyle: { findMany: ReturnType<typeof vi.fn> } }).coloringStyle.findMany
      .mockResolvedValueOnce([]);
    const ctx = fakeCtx("j1", "book1");
    const deps = makeDeps();

    await expect(stepGenerateCover(ctx, db, deps)).rejects.toThrow(
      /No ColoringStyle rows/,
    );
    const failedUpdate = bookUpdates.find(
      (u) => ((u.data as { coverMeta?: { status?: string } })?.coverMeta?.status) === "failed",
    );
    expect(failedUpdate).toBeDefined();
    expect(
      ((failedUpdate!.data as { coverMeta: { error: string } }).coverMeta.error),
    ).toMatch(/ColoringStyle/);
    expect(ctx.markStepComplete).not.toHaveBeenCalled();
  });

  it("throws when Book has 0 coloring pages", async () => {
    const { db } = makeDb();
    (db as { book: { findUnique: ReturnType<typeof vi.fn> } }).book.findUnique
      .mockResolvedValueOnce({ ...OK_BOOK, coloringPages: [] });
    const ctx = fakeCtx("j1", "book1");
    const deps = makeDeps();

    await expect(stepGenerateCover(ctx, db, deps)).rejects.toThrow(
      /no coloring pages/,
    );
  });

  it("throws when colorizeImage fails and marks coverMeta.status=failed", async () => {
    const { db, bookUpdates } = makeDb();
    const ctx = fakeCtx("j1", "book1");
    const deps = makeDeps();
    deps.colorizeImage.mockRejectedValueOnce(new Error("Diaflow 500"));

    await expect(stepGenerateCover(ctx, db, deps)).rejects.toThrow(/Diaflow 500/);
    const failedUpdate = bookUpdates.find(
      (u) => ((u.data as { coverMeta?: { status?: string } })?.coverMeta?.status) === "failed",
    );
    expect(failedUpdate).toBeDefined();
  });

  it("uses bookData.title fallback when titleCover is missing", async () => {
    const { db, bookUpdates } = makeDb();
    (db as { cloneJob: { findUnique: ReturnType<typeof vi.fn> } }).cloneJob.findUnique
      .mockResolvedValueOnce({
        id: "j1",
        data: { brandId: "b1" },
        bookData: { title: "Fallback Title" }, // no titleCover
        resultBookId: "book1",
      });
    const ctx = fakeCtx("j1", "book1");
    const deps = makeDeps();

    await stepGenerateCover(ctx, db, deps);
    const update = bookUpdates[0];
    const meta = (update.data as { coverMeta: { titleCover: string; subtitle: string } }).coverMeta;
    expect(meta.titleCover).toBe("Fallback Title");
    expect(meta.subtitle).toBe("");
  });

  it("handles 1-page book (middleIdx = 1)", async () => {
    const { db, bookUpdates } = makeDb();
    (db as { book: { findUnique: ReturnType<typeof vi.fn> } }).book.findUnique
      .mockResolvedValueOnce({
        ...OK_BOOK,
        coloringPages: [{ id: "p1", url: "/only.png" }],
      });
    const ctx = fakeCtx("j1", "book1");
    const deps = makeDeps();

    await stepGenerateCover(ctx, db, deps);
    expect(deps.colorizeImage).toHaveBeenCalledWith(
      "https://r2/only.png",
      expect.any(String),
      expect.any(Object),
    );
    const meta = (bookUpdates[0].data as { coverMeta: { middlePageIndex: number } }).coverMeta;
    expect(meta.middlePageIndex).toBe(1);
  });
});
