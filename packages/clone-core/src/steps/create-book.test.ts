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
    const deps = { randomUUID: () => "uuid-1" };

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

  it("still writes undefined sceneData when a page has no rawData", async () => {
    const { db, created } = fakeDb();
    (db as { cloneJob: { findUnique: ReturnType<typeof vi.fn> } }).cloneJob.findUnique.mockResolvedValueOnce({
      id: "j1",
      name: "MyBook",
      bookData: {},
      pages: [{ pageNumber: 1, imageUrl: "https://r2/x.png", redesignedUrl: "https://r2/y.png" }],
    });
    const ctx = fakeCtx("j1");
    await stepCreateBook(ctx, db, { randomUUID: () => "uuid-1" });
    const book = created[0].data as { coloringPages: Array<{ sceneData?: unknown }> };
    expect(book.coloringPages[0].sceneData).toBeUndefined();
  });
});
