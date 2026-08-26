import { describe, it, expect, vi } from "vitest";
import { stepCreateBook } from "./create-book";

function fakeCtx(jobId: string) {
  return {
    jobId,
    resultBookId: undefined,
    sourceBookId: undefined,
    markStepComplete: vi.fn().mockResolvedValue(undefined),
  } as never;
}

const RAW_DATA_WITH_EXTRA_FIELDS = {
  scene: { description: "cozy corner", cameraView: "wide", composition: "" },
  environment: { timeOfDay: "evening", weather: "", season: "", mood: "peaceful" },
  characters: [{ name: "Woman", type: "person", role: "main", characterPrompt: "p" }],
  locations: [{ name: "Room", description: "d", locationPrompt: "lp" }],
  props: [{ name: "lamp", position: "left", interaction: "on" }],
  reproductionPrompt: "prompt",
  // NEW extra fields that create-book must persist
  titleCover: "Peaceful Haven Moments",
  subtitle: "Relaxing illustrations",
  isCover: true,
  isBW: false,
  visualDna: { shapeLanguage: "round" },
};

function fakeDb() {
  const created: Array<{ table: string; data: unknown }> = [];
  return {
    created,
    db: {
      cloneJob: {
        findUnique: vi.fn().mockResolvedValue({
          id: "j1",
          name: "MyBook",
          bookData: { title: "MyBook" },
          pages: [
            {
              pageNumber: 1,
              imageUrl: "https://r2/orig.png",
              redesignedUrl: "https://r2/red.png",
              rawData: RAW_DATA_WITH_EXTRA_FIELDS,
            },
          ],
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      book: {
        create: vi.fn().mockImplementation(async (arg: { data: unknown }) => {
          created.push({ table: "book", data: arg.data });
        }),
      },
    } as never,
  };
}

describe("stepCreateBook — writes full rawData into sceneData", () => {
  it("preserves all fields the LLM emitted (including new ones like isCover, titleCover)", async () => {
    const { db, created } = fakeDb();
    const ctx = fakeCtx("j1");
    const deps = {
      randomUUID: () => "uuid-1",
      copyImage: async ({ destKey }: { sourceUrl: string; destKey: string }) => `/${destKey}`,
    };

    await stepCreateBook(ctx, db, deps);

    const book = created[0].data as {
      coloringPages: Array<{ sceneData: Record<string, unknown> }>;
    };
    const scene = book.coloringPages[0].sceneData;
    expect(scene.titleCover).toBe("Peaceful Haven Moments");
    expect(scene.subtitle).toBe("Relaxing illustrations");
    expect(scene.isCover).toBe(true);
    expect(scene.isBW).toBe(false);
    expect(scene.visualDna).toEqual({ shapeLanguage: "round" });
    // Existing consumers still see the same core shape
    expect(scene.scene).toEqual({ description: "cozy corner", cameraView: "wide", composition: "" });
    expect(scene.characters).toEqual(RAW_DATA_WITH_EXTRA_FIELDS.characters);
    expect(scene.locations).toEqual(RAW_DATA_WITH_EXTRA_FIELDS.locations);
  });

  it("recovers rawData stored as a JSON string without producing numeric keys", async () => {
    const { db, created } = fakeDb();
    (db as { cloneJob: { findUnique: ReturnType<typeof vi.fn> } }).cloneJob.findUnique.mockResolvedValueOnce({
      id: "j1",
      name: "MyBook",
      bookData: {},
      // rawData persisted as a JSON string — the old `{ ...p.rawData }` spread
      // this into { "0": "{", "1": "\"", … } (the malformed sceneData bug).
      pages: [
        {
          pageNumber: 1,
          imageUrl: "https://r2/x.png",
          redesignedUrl: "https://r2/y.png",
          rawData: JSON.stringify(RAW_DATA_WITH_EXTRA_FIELDS),
        },
      ],
    });
    const ctx = fakeCtx("j1");
    await stepCreateBook(ctx, db, {
      randomUUID: () => "uuid-1",
      copyImage: async ({ destKey }) => `/${destKey}`,
    });
    const book = created[0].data as { coloringPages: Array<{ sceneData: Record<string, unknown> }> };
    const scene = book.coloringPages[0].sceneData;
    expect(scene["0"]).toBeUndefined(); // no numeric-key corruption
    expect(scene.subtitle).toBe("Relaxing illustrations");
    expect(scene.scene).toEqual({ description: "cozy corner", cameraView: "wide", composition: "" });
  });

  it("still writes undefined sceneData when a page has no rawData", async () => {
    const { db, created } = fakeDb();
    (db as { cloneJob: { findUnique: ReturnType<typeof vi.fn> } }).cloneJob.findUnique.mockResolvedValueOnce({
      id: "j1",
      name: "MyBook",
      bookData: {},
      pages: [{ pageNumber: 1, imageUrl: "https://r2/x.png", redesignedUrl: "https://r2/y.png" }],
    });
    const ctx = fakeCtx("j1");
    await stepCreateBook(ctx, db, {
      randomUUID: () => "uuid-1",
      copyImage: async ({ destKey }) => `/${destKey}`,
    });
    const book = created[0].data as { coloringPages: Array<{ sceneData?: unknown }> };
    expect(book.coloringPages[0].sceneData).toBeUndefined();
  });
});

describe("stepCreateBook — moves page images into assets/{bookId}/", () => {
  it("copies each page's redesigned image out of the clone-job prefix into assets/{bookId}/pages/", async () => {
    const { db, created } = fakeDb();
    const ctx = fakeCtx("j1");
    const copyImage = vi.fn(async ({ destKey }: { sourceUrl: string; destKey: string }) => `/${destKey}`);

    const bookId = await stepCreateBook(ctx, db, { randomUUID: () => "uuid-1", copyImage });

    expect(copyImage).toHaveBeenCalledWith({
      sourceUrl: "https://r2/red.png",
      destKey: `assets/${bookId}/pages/page-001.png`,
    });

    const book = created[0].data as { coloringPages: Array<{ url: string }>; coverUrl: string };
    expect(book.coloringPages[0].url).toBe(`/assets/${bookId}/pages/page-001.png`);
    expect(book.coloringPages[0].url).not.toContain("clone-jobs");
    expect(book.coverUrl).toBe(`/assets/${bookId}/pages/page-001.png`);
  });
});

describe("stepCreateBook — D2 classification partitioning", () => {
  function fakeDbMixed() {
    const created: Array<{ table: string; data: unknown }> = [];
    return {
      created,
      db: {
        cloneJob: {
          findUnique: vi.fn().mockResolvedValue({
            id: "j1",
            name: "MyBook",
            bookData: {},
            pages: [
              { pageNumber: 1, imageUrl: "o1", redesignedUrl: "cover.png", pageType: "cover" },
              { pageNumber: 2, imageUrl: "o2", redesignedUrl: "intro.png", pageType: "interiorIntro" },
              { pageNumber: 3, imageUrl: "o3", redesignedUrl: "int3.png", pageType: "interior" },
              { pageNumber: 4, imageUrl: "o4", redesignedUrl: "int4.png", pageType: "interior", excluded: true },
              { pageNumber: 5, imageUrl: "o5", redesignedUrl: "legacy.png" }, // no pageType → interior
            ],
          }),
          update: vi.fn().mockResolvedValue(undefined),
        },
        book: {
          create: vi.fn().mockImplementation(async (arg: { data: unknown }) => {
            created.push({ table: "book", data: arg.data });
          }),
        },
      } as never,
    };
  }

  it("routes cover→coverUrl, intro→summaryPages, interior(+legacy)→coloringPages, drops excluded", async () => {
    const { db, created } = fakeDbMixed();
    const ctx = {
      jobId: "j1",
      resultBookId: undefined,
      sourceBookId: undefined,
      markStepComplete: vi.fn().mockResolvedValue(undefined),
    } as never;

    const bookId = await stepCreateBook(ctx, db, {
      randomUUID: () => "uuid-1",
      copyImage: async ({ destKey }: { sourceUrl: string; destKey: string }) => `/${destKey}`,
    });

    const book = created[0].data as {
      coverUrl: string;
      summaryPages: Array<{ url: string }>;
      coloringPages: Array<{ url: string }>;
    };
    // interior = pages 3 and 5 (legacy undefined counts as interior); 4 excluded
    expect(book.coloringPages).toHaveLength(2);
    // intro = page 2
    expect(book.summaryPages).toHaveLength(1);
    // cover image is moved and mirrored into coverUrl
    expect(book.coverUrl).toBe(`/assets/${bookId}/cover.png`);
    expect(book.coverUrl).not.toContain("clone-jobs");
  });

  it("falls back coverUrl to the first interior when no cover page exists", async () => {
    const { db, created } = fakeDbMixed();
    (db as { cloneJob: { findUnique: ReturnType<typeof vi.fn> } }).cloneJob.findUnique.mockResolvedValueOnce({
      id: "j1",
      name: "MyBook",
      bookData: {},
      pages: [{ pageNumber: 1, imageUrl: "o1", redesignedUrl: "int1.png", pageType: "interior" }],
    });
    const ctx = {
      jobId: "j1", resultBookId: undefined, sourceBookId: undefined,
      markStepComplete: vi.fn().mockResolvedValue(undefined),
    } as never;
    const bookId = await stepCreateBook(ctx, db, {
      randomUUID: () => "uuid-1",
      copyImage: async ({ destKey }: { sourceUrl: string; destKey: string }) => `/${destKey}`,
    });
    const book = created[0].data as { coverUrl: string; coloringPages: unknown[] };
    expect(book.coverUrl).toBe(`/assets/${bookId}/pages/page-001.png`);
    expect(book.coloringPages).toHaveLength(1);
  });
});

describe("stepCreateBook — clone-drop flag", () => {
  const deps = {
    randomUUID: () => "uuid-1",
    copyImage: async ({ destKey }: { sourceUrl: string; destKey: string }) => `/${destKey}`,
  };

  it("drops pages marked excludedFromClone from the built Book", async () => {
    const { db, created } = fakeDb();
    (db as { cloneJob: { findUnique: ReturnType<typeof vi.fn> } }).cloneJob.findUnique.mockResolvedValueOnce({
      id: "j1",
      name: "MyBook",
      bookData: { title: "MyBook" },
      pages: [
        { pageNumber: 1, imageUrl: "/a.png", redesignedUrl: "/ra.png", pageType: "interior" },
        { pageNumber: 2, imageUrl: "/b.png", redesignedUrl: "/rb.png", pageType: "interior", excludedFromClone: true },
        { pageNumber: 3, imageUrl: "/c.png", redesignedUrl: "/rc.png", pageType: "interior" },
      ],
    });

    await stepCreateBook(fakeCtx("j1"), db, deps);

    const book = created[0].data as { coloringPages: Array<{ sourcePageNumber: number }> };
    expect(book.coloringPages.map((p) => p.sourcePageNumber)).toEqual([1, 3]);
  });

  it("still honours the legacy `excluded` flag on old rows", async () => {
    const { db, created } = fakeDb();
    (db as { cloneJob: { findUnique: ReturnType<typeof vi.fn> } }).cloneJob.findUnique.mockResolvedValueOnce({
      id: "j1",
      name: "MyBook",
      bookData: { title: "MyBook" },
      pages: [
        { pageNumber: 1, imageUrl: "/a.png", redesignedUrl: "/ra.png", pageType: "interior" },
        { pageNumber: 2, imageUrl: "/b.png", redesignedUrl: "/rb.png", pageType: "interior", excluded: true },
      ],
    });

    await stepCreateBook(fakeCtx("j1"), db, deps);

    const book = created[0].data as { coloringPages: Array<{ sourcePageNumber: number }> };
    expect(book.coloringPages.map((p) => p.sourcePageNumber)).toEqual([1]);
  });
});
