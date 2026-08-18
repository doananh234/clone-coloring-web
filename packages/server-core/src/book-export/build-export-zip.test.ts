import { afterEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { collectExportPlan, buildExportZip, type ExportInput } from "./build-export-zip";

const baseInput: ExportInput = {
  bookTitle: "Cute Farm",
  bookData: {
    coverCandidates: [{ url: "/assets/b/cc-1.png" }, { url: "/assets/b/cc-2.png" }],
    sourceCovers: [{ url: "/assets/b/sc-1.png", coloredUrl: "/assets/b/sc-1-c.png" }],
  },
  coverUrl: "/assets/b/cover.png",
  summaryPages: [{ url: "/assets/b/intro-1.png" }],
  coloringPages: [
    { url: "/assets/b/int-1.png", coloredUrl: "/assets/b/int-1-c.png" },
    { url: "/assets/b/int-2.png" },
  ],
  cloneJobPages: [
    { imageUrl: "/assets/src/p1.png", pageType: "cover" },
    { imageUrl: "/assets/src/p2.png", pageType: "interiorIntro" },
    { imageUrl: "/assets/src/p3.png", pageType: "interior" },
    { imageUrl: "/assets/src/p4.png", excluded: true },
  ],
  cloneJobId: "job-1",
};

describe("collectExportPlan", () => {
  it("lays out Main book + Clone book folders with expected entry counts", () => {
    const plan = collectExportPlan(baseInput);
    const byPath = Object.fromEntries(plan.folders.map((f) => [f.path, f.entries]));

    expect(byPath["Main book/Book cover"].map((e) => e.url)).toEqual(["/assets/src/p1.png"]);
    expect(byPath["Main book/Book intro"].map((e) => e.url)).toEqual(["/assets/src/p2.png"]);
    // interior excludes the cover, the intro, and the excluded page
    expect(byPath["Main book/Book interior"].map((e) => e.url)).toEqual(["/assets/src/p3.png"]);

    expect(byPath["Clone book/Book cover"].map((e) => e.name)).toEqual(["cover-01", "cover-02"]);
    expect(byPath["Clone book/Book intro"].map((e) => e.url)).toEqual(["/assets/b/intro-1.png"]);
    expect(byPath["Clone book/Book interior"].map((e) => e.name)).toEqual(["page-001", "page-002"]);
    expect(byPath["Clone book/Book colored"].map((e) => e.url)).toEqual(["/assets/b/int-1-c.png"]);
    expect(byPath["Clone book/Source cover"].map((e) => e.url)).toEqual(["/assets/b/sc-1.png"]);
    expect(byPath["Clone book/Source cover colored"].map((e) => e.url)).toEqual(["/assets/b/sc-1-c.png"]);

    expect(plan.filename).toBe(`cute-farm-${plan.hash}.zip`);
  });

  it("falls back to the first source page as cover when none is classified", () => {
    const plan = collectExportPlan({
      ...baseInput,
      cloneJobPages: [{ imageUrl: "/assets/src/a.png" }, { imageUrl: "/assets/src/b.png" }],
    });
    const cover = plan.folders.find((f) => f.path === "Main book/Book cover")!;
    expect(cover.entries.map((e) => e.url)).toEqual(["/assets/src/a.png"]);
  });

  it("cover fallback skips an excluded first source page", () => {
    const plan = collectExportPlan({
      ...baseInput,
      cloneJobPages: [
        { imageUrl: "/assets/src/excluded.png", excluded: true },
        { imageUrl: "/assets/src/first-included.png" },
      ],
    });
    const cover = plan.folders.find((f) => f.path === "Main book/Book cover")!;
    expect(cover.entries.map((e) => e.url)).toEqual(["/assets/src/first-included.png"]);
  });

  it("omits Main book folders when there is no source clone job", () => {
    const plan = collectExportPlan({ ...baseInput, cloneJobPages: null, cloneJobId: undefined });
    expect(plan.folders.some((f) => f.path.startsWith("Main book/"))).toBe(false);
  });

  it("hash is stable for identical input and changes when any url changes", () => {
    const a = collectExportPlan(baseInput).hash;
    const b = collectExportPlan(structuredClone(baseInput)).hash;
    expect(a).toBe(b);
    const changed = collectExportPlan({
      ...baseInput,
      coloringPages: [{ url: "/assets/b/CHANGED.png" }],
    }).hash;
    expect(changed).not.toBe(a);
  });
});

describe("buildExportZip", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("adds fetchable images and skips failed ones", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("int-2")) return { ok: false, status: 404 } as unknown as Response;
        return { ok: true, arrayBuffer: async () => png.buffer } as unknown as Response;
      }),
    );

    const plan = collectExportPlan({
      ...baseInput,
      bookData: {},
      coverUrl: null,
      summaryPages: [],
      cloneJobPages: null,
      cloneJobId: undefined,
      coloringPages: [{ url: "/assets/b/int-1.png" }, { url: "/assets/b/int-2.png" }],
    });
    const buf = await buildExportZip(plan);
    const zip = await JSZip.loadAsync(buf);
    expect(zip.file("Clone book/Book interior/page-001.png")).not.toBeNull();
    expect(zip.file("Clone book/Book interior/page-002.png")).toBeNull(); // 404 skipped
  });

  it("detects jpeg magic bytes and names the file .jpg", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, arrayBuffer: async () => jpeg.buffer } as unknown as Response)),
    );
    const plan = collectExportPlan({
      ...baseInput,
      bookData: {},
      coverUrl: null,
      summaryPages: [],
      cloneJobPages: null,
      cloneJobId: undefined,
      coloringPages: [{ url: "/assets/b/int-1.png" }],
    });
    const zip = await JSZip.loadAsync(await buildExportZip(plan));
    expect(zip.file("Clone book/Book interior/page-001.jpg")).not.toBeNull();
    expect(zip.file("Clone book/Book interior/page-001.png")).toBeNull();
  });
});
