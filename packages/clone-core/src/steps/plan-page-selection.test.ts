import { describe, it, expect } from "vitest";
import { planPageSelection, LANE1_MIN_INTERIOR, type SelectablePage } from "./plan-page-selection";

const interiors = (n: number, from = 1): SelectablePage[] =>
  Array.from({ length: n }, (_, i) => ({ pageNumber: from + i, pageType: "interior" as const }));

describe("planPageSelection", () => {
  it("40 interiors → lane 1, every page kept", () => {
    const sel = planPageSelection(interiors(40));
    expect(sel.lane).toBe(1);
    expect(sel.interiorCount).toBe(40);
    expect(sel.keptPageNumbers).toHaveLength(40);
  });

  it("39 interiors → lane 2", () => {
    expect(planPageSelection(interiors(39)).lane).toBe(2);
  });

  it("cover and intro pages are kept but do not count toward interior", () => {
    const pages: SelectablePage[] = [
      { pageNumber: 1, pageType: "cover" },
      { pageNumber: 2, pageType: "interiorIntro" },
      ...interiors(40, 3),
    ];
    const sel = planPageSelection(pages);
    expect(sel.interiorCount).toBe(40);
    expect(sel.lane).toBe(1);
    // cover + intro still go to Diaflow — create-book needs their redesigns
    expect(sel.keptPageNumbers).toHaveLength(42);
    expect(sel.keptPageNumbers[0]).toBe(1);
  });

  it("dropped pages are excluded from keptPageNumbers and from the interior count", () => {
    const pages: SelectablePage[] = [
      ...interiors(40),
      { pageNumber: 41, pageType: "interior", excludedFromClone: true },
      { pageNumber: 42, pageType: "interior", excludedFromClone: true },
    ];
    const sel = planPageSelection(pages);
    expect(sel.keptPageNumbers).toHaveLength(40);
    expect(sel.keptPageNumbers).not.toContain(41);
    expect(sel.interiorCount).toBe(40);
  });

  it("dropping interiors can push a job from lane 1 into lane 2", () => {
    const pages: SelectablePage[] = [
      ...interiors(40),
      { pageNumber: 1, pageType: "interior", excludedFromClone: true },
    ].map((p, i) => ({ ...p, pageNumber: i + 1 }));
    const sel = planPageSelection(pages);
    expect(sel.interiorCount).toBe(40);
    expect(sel.lane).toBe(1);
    const dropped = planPageSelection(
      interiors(40).map((p, i) => (i === 0 ? { ...p, excludedFromClone: true } : p)),
    );
    expect(dropped.interiorCount).toBe(39);
    expect(dropped.lane).toBe(2);
  });

  it("a page with no pageType counts as interior (legacy rule)", () => {
    const pages: SelectablePage[] = Array.from({ length: 40 }, (_, i) => ({ pageNumber: i + 1 }));
    expect(planPageSelection(pages).interiorCount).toBe(40);
  });

  it("honours the legacy `excluded` flag", () => {
    const pages = interiors(40).map((p, i) => (i === 0 ? { ...p, excluded: true } : p));
    expect(planPageSelection(pages).keptPageNumbers).toHaveLength(39);
  });

  it("keptPageNumbers is ascending regardless of input order", () => {
    const sel = planPageSelection([
      { pageNumber: 3, pageType: "interior" },
      { pageNumber: 1, pageType: "interior" },
      { pageNumber: 2, pageType: "interior" },
    ]);
    expect(sel.keptPageNumbers).toEqual([1, 2, 3]);
  });

  it("exports the documented threshold", () => {
    expect(LANE1_MIN_INTERIOR).toBe(40);
  });
});
