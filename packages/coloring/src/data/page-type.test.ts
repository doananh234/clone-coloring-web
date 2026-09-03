import { describe, it, expect } from "vitest";
import { applyPageType, derivePageType, findBookPage, type BookPagesState } from "./page-type";
import type { BookColoringPage } from "./types";

const mk = (id: string, url: string): BookColoringPage => ({ id, url, isPublic: false });

const base = (): BookPagesState => ({
  coverUrl: "cover.png",
  summaryPages: [mk("s1", "s1.png")],
  coloringPages: [mk("c1", "c1.png"), mk("c2", "c2.png")],
});

describe("applyPageType", () => {
  it("moves an interior page to intro", () => {
    const next = applyPageType(base(), "c1", "intro");
    expect(next.coloringPages.map((p) => p.id)).toEqual(["c2"]);
    expect(next.summaryPages.map((p) => p.id)).toEqual(["s1", "c1"]);
  });

  it("moves an intro page back to interior (the reported bug)", () => {
    const next = applyPageType(base(), "s1", "interior");
    expect(next.summaryPages).toEqual([]);
    expect(next.coloringPages.map((p) => p.id)).toEqual(["c1", "c2", "s1"]);
  });

  it("setting cover updates coverUrl and keeps array membership", () => {
    const next = applyPageType(base(), "c2", "cover");
    expect(next.coverUrl).toBe("c2.png");
    expect(next.coloringPages.map((p) => p.id)).toEqual(["c1", "c2"]);
    expect(next.summaryPages.map((p) => p.id)).toEqual(["s1"]);
  });

  it("is a no-op (same reference) for an unknown page id", () => {
    const s = base();
    expect(applyPageType(s, "nope", "intro")).toBe(s);
  });

  it("does not mutate the input state", () => {
    const s = base();
    applyPageType(s, "c1", "intro");
    expect(s.coloringPages.map((p) => p.id)).toEqual(["c1", "c2"]);
    expect(s.summaryPages.map((p) => p.id)).toEqual(["s1"]);
  });

  it("re-assigning to the same type is idempotent on membership", () => {
    const next = applyPageType(base(), "c1", "interior");
    expect(next.coloringPages.map((p) => p.id)).toEqual(["c2", "c1"]);
    expect(next.summaryPages.map((p) => p.id)).toEqual(["s1"]);
  });
});

describe("derivePageType", () => {
  it("returns cover when the page url matches coverUrl", () => {
    const s: BookPagesState = { coverUrl: "c1.png", summaryPages: [], coloringPages: [mk("c1", "c1.png")] };
    expect(derivePageType(s, s.coloringPages[0])).toBe("cover");
  });

  it("returns intro when the page is in summaryPages", () => {
    const s = base();
    expect(derivePageType(s, s.summaryPages[0])).toBe("intro");
  });

  it("returns interior otherwise", () => {
    const s = base();
    expect(derivePageType(s, s.coloringPages[0])).toBe("interior");
  });
});

describe("findBookPage", () => {
  it("finds across both arrays and returns undefined when absent", () => {
    const s = base();
    expect(findBookPage(s, "s1")?.id).toBe("s1");
    expect(findBookPage(s, "c2")?.id).toBe("c2");
    expect(findBookPage(s, "x")).toBeUndefined();
  });
});
