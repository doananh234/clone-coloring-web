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
    // NOTE: `url` here are the FINAL book page urls (colored/redesigned). The
    // source-style extraction reads job.pages[0].imageUrl instead (see makeDb).
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
          // Source page: extract-source-style analyzes pages[0].imageUrl.
          pages: [{ imageUrl: "/source/cover.png" }],
        }),
      },
      brand: {
        findUnique: vi.fn().mockResolvedValue(OK_BRAND),
        findFirst: vi.fn().mockResolvedValue(OK_BRAND),
      },
      coloringStyle: {
        // Source-style extraction CREATES a new coloring style row.
        create: vi.fn().mockResolvedValue({
          id: "src-style",
          colorizationDirective: "source cover style",
          referenceImages: [],
        }),
        findUnique: vi.fn().mockResolvedValue(OK_STYLE),
        // upsertColoringStyleWithVariant looks up an existing same-named style;
        // null → it takes the create path (returns the "src-style" row above).
        findFirst: vi.fn().mockResolvedValue(null),
        // Only hit as a last-resort fallback when extraction produces nothing.
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
    // Source-style extraction returns parsed style JSON with a directive.
    extractColoringStyle: vi.fn().mockResolvedValue({
      name: "Source Cover Style",
      colorizationDirective: "source cover style",
    }),
    generateCoverSource: vi.fn().mockResolvedValue({
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

    // Style comes from the SOURCE page, not a random DB pick.
    expect(deps.extractColoringStyle).toHaveBeenCalledWith("https://r2/source/cover.png");
    // Cover source is now a RANDOM interior page (1 of 4). Directive is the
    // extracted source-cover directive, not the brand-default style.
    const coverCall = deps.generateCoverSource.mock.calls[0] as [
      string,
      string,
      { referenceImageUrls: string[] },
    ];
    expect(coverCall[0]).toMatch(/^https:\/\/r2\/pages\/[1-4]\.png$/);
    expect(coverCall[1]).toBe("source cover style");
    // The extracted source style carries the source cover as a style reference.
    expect(coverCall[2]).toEqual({
      referenceImageUrls: ["https://r2/source/cover.png"],
    });
    // findMany (the old random-pick path) must NOT be used on the happy path.
    expect(
      (db as { coloringStyle: { findMany: ReturnType<typeof vi.fn> } }).coloringStyle.findMany,
    ).not.toHaveBeenCalled();
    // CLEAN cover source: the step does NOT bake typography here — it stores
    // the text-free recomposed illustration and leaves generateAiCover for the
    // on-demand Cover editor. So generateAiCover is NOT called in the worker.
    expect(deps.generateAiCover).not.toHaveBeenCalled();
    // Only the cover-source thumbnail is uploaded inside the step.
    expect(deps.uploadToR2).toHaveBeenCalledTimes(1);

    const update = bookUpdates[0];
    // coverUrl points at the clean text-free cover source (= thumbnail), not a
    // typography-baked AI cover.
    expect(update.coverUrl).toBe("https://r2/cover/thumbnail.png");
    expect(update.thumbnailUrl).toBe("https://r2/cover/thumbnail.png");
    expect(update.squareThumbnailUrl).toBe("https://r2/cover/thumbnail.png");
    const meta = (update.data as { coverMeta: Record<string, unknown> }).coverMeta;
    expect(meta.status).toBe("generated");
    expect(meta.titleCover).toBe("My Cover");
    expect(meta.subtitle).toBe("My Sub");
    expect(meta.brandId).toBe("b1");
    // Style row created from the source cover, not the brand default "cs1".
    expect(meta.coloringStyleId).toBe("src-style");
    // Random interior index (1-4), and it must match the page actually used.
    expect(meta.middlePageIndex).toBeGreaterThanOrEqual(1);
    expect(meta.middlePageIndex).toBeLessThanOrEqual(4);
    expect(coverCall[0]).toBe(`https://r2/pages/${meta.middlePageIndex}.png`);
    expect(meta.sourceThumbnailUrl).toBe("https://r2/cover/thumbnail.png");
    expect(ctx.markStepComplete).toHaveBeenCalledWith("generate-cover");
  });
});

describe("stepGenerateCover — failure paths", () => {
  it("throws + marks coverMeta.status=failed when source extraction fails and NO fallback style exists", async () => {
    // New behavior: style comes from the source page. We only fail when source
    // extraction produces no directive AND there is no usable fallback style
    // (brand default missing/unusable + no other style with a directive).
    const { db, bookUpdates } = makeDb();
    (db as { coloringStyle: { findUnique: ReturnType<typeof vi.fn> } }).coloringStyle.findUnique
      .mockResolvedValueOnce(null); // brand default not usable
    (db as { coloringStyle: { findMany: ReturnType<typeof vi.fn> } }).coloringStyle.findMany
      .mockResolvedValueOnce([]); // no other usable styles
    const ctx = fakeCtx("j1", "book1");
    const deps = makeDeps();
    // Extraction fails → falls through to the (empty) fallback chain.
    deps.extractColoringStyle.mockRejectedValueOnce(new Error("vision 500"));

    await expect(stepGenerateCover(ctx, db, deps)).rejects.toThrow(
      /No usable ColoringStyle/,
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

  it("falls back to brand-default style (NOT random) when source extraction yields no directive", async () => {
    const { db, bookUpdates } = makeDb();
    const ctx = fakeCtx("j1", "book1");
    const deps = makeDeps();
    // Extraction returns JSON with no usable directive → brand-default fallback.
    deps.extractColoringStyle.mockResolvedValueOnce({ name: "x", colorizationDirective: "  " });

    await stepGenerateCover(ctx, db, deps);

    // Brand default (OK_STYLE cs1) is used via findUnique; no create, no random.
    expect(
      (db as { coloringStyle: { create: ReturnType<typeof vi.fn> } }).coloringStyle.create,
    ).not.toHaveBeenCalled();
    expect(deps.generateCoverSource).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/r2\/pages\/[1-4]\.png$/),
      "watercolor style",
      { referenceImageUrls: [] },
    );
    const meta = (bookUpdates[0].data as { coverMeta: { coloringStyleId: string } }).coverMeta;
    expect(meta.coloringStyleId).toBe("cs1");
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

  it("throws when generateCoverSource fails and marks coverMeta.status=failed", async () => {
    const { db, bookUpdates } = makeDb();
    const ctx = fakeCtx("j1", "book1");
    const deps = makeDeps();
    deps.generateCoverSource.mockRejectedValueOnce(new Error("Diaflow 500"));

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
    expect(deps.generateCoverSource).toHaveBeenCalledWith(
      "https://r2/only.png",
      expect.any(String),
      expect.any(Object),
    );
    const meta = (bookUpdates[0].data as { coverMeta: { middlePageIndex: number } }).coverMeta;
    expect(meta.middlePageIndex).toBe(1);
  });
});
