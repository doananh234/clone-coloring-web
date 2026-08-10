import { describe, it, expect } from "vitest";
import { planFillInterior, type FillInteriorPage } from "./fill-interior";

// Build N interior pages numbered 1..N with a source image each.
const interiors = (n: number): FillInteriorPage[] =>
  Array.from({ length: n }, (_, i) => ({
    pageNumber: i + 1,
    imageUrl: `/src/page-${i + 1}.png`,
    pageType: "interior" as const,
    origin: "original" as const,
  }));

describe("planFillInterior", () => {
  it("30 interiors, target 40 → 10 distinct-parent tasks all at 40%", () => {
    const tasks = planFillInterior(interiors(30), 40);
    expect(tasks).toHaveLength(10);
    expect(tasks.every((t) => t.changePercent === 40)).toBe(true);
    expect(tasks.map((t) => t.pageNumber)).toEqual(
      [31, 32, 33, 34, 35, 36, 37, 38, 39, 40],
    );
    // identity shuffle → parents are the first 10 interiors, none repeated
    expect(new Set(tasks.map((t) => t.parentPageNumber)).size).toBe(10);
  });

  it("10 interiors, target 40 → 30 tasks escalating 40/50/60 per reuse round", () => {
    const tasks = planFillInterior(interiors(10), 40);
    expect(tasks).toHaveLength(30);
    expect(tasks.slice(0, 10).every((t) => t.changePercent === 40)).toBe(true);
    expect(tasks.slice(10, 20).every((t) => t.changePercent === 50)).toBe(true);
    expect(tasks.slice(20, 30).every((t) => t.changePercent === 60)).toBe(true);
  });

  it("caps change-% at 80 on deep reuse", () => {
    // 1 interior, target 8 → existing=1, need=7 → rounds 0..6 → 40,50,60,70,80,80,80
    const tasks = planFillInterior(interiors(1), 8);
    expect(tasks.map((t) => t.changePercent)).toEqual([40, 50, 60, 70, 80, 80, 80]);
  });

  it("returns [] when already at/over target", () => {
    expect(planFillInterior(interiors(40), 40)).toEqual([]);
    expect(planFillInterior(interiors(45), 40)).toEqual([]);
  });

  it("returns [] when the source pool is empty (no original interiors)", () => {
    const pages: FillInteriorPage[] = [
      { pageNumber: 1, imageUrl: "/c.png", pageType: "cover" },
      { pageNumber: 2, imageUrl: "/i.png", pageType: "interiorIntro" },
    ];
    expect(planFillInterior(pages, 40)).toEqual([]);
  });

  it("excludes excluded pages from both count and pool", () => {
    const pages = interiors(12).map((p, i) => (i < 2 ? { ...p, excluded: true } : p));
    // existing interior !excluded = 10 → need 30
    expect(planFillInterior(pages, 40)).toHaveLength(30);
  });

  it("never picks an additional page as a source", () => {
    const pages: FillInteriorPage[] = [
      ...interiors(3),
      { pageNumber: 4, imageUrl: "/a.png", pageType: "interior", origin: "additional" },
    ];
    // existing interior !excluded = 4 → need... target 6 → 2 tasks, parents ∈ {1,2,3}
    const tasks = planFillInterior(pages, 6);
    expect(tasks).toHaveLength(2);
    expect(tasks.every((t) => [1, 2, 3].includes(t.parentPageNumber))).toBe(true);
  });
});
