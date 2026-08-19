import { describe, it, expect } from "vitest";
import { additionalParentNumber, buildAdditionalPage, planVariantMigration } from "./additional-pages";
import type { BookColoringPage } from "./types";

describe("additionalParentNumber", () => {
  it("uses sourcePageNumber for an original source", () => {
    expect(additionalParentNumber({ origin: "original", sourcePageNumber: 7 }, 3)).toBe(7);
  });
  it("uses parentPageNumber for an additional source", () => {
    expect(additionalParentNumber({ origin: "additional", parentPageNumber: 5, sourcePageNumber: 99 }, 3)).toBe(5);
  });
  it("falls back to index+1 when both are missing", () => {
    expect(additionalParentNumber({}, 3)).toBe(4);
  });
});

describe("buildAdditionalPage", () => {
  it("builds an additional interior page, omitting empty optionals", () => {
    const p = buildAdditionalPage({ id: "a1", url: "/assets/x.png", parentPageNumber: 7 });
    expect(p).toMatchObject({ id: "a1", url: "/assets/x.png", origin: "additional", parentPageNumber: 7, isPublic: false });
    expect("prompt" in p).toBe(false);
    expect("coloredUrl" in p).toBe(false);
  });
  it("keeps prompt + coloredUrl when provided", () => {
    const p = buildAdditionalPage({ id: "a1", url: "/u.png", parentPageNumber: 7, prompt: "scene", coloredUrl: "/c.png" });
    expect(p.prompt).toBe("scene");
    expect(p.coloredUrl).toBe("/c.png");
  });
});

describe("planVariantMigration", () => {
  const newId = (() => { let n = 0; return () => `new-${++n}`; });

  it("no-op for a page without variants", () => {
    const page: BookColoringPage = { id: "p1", url: "/p1.png", sourcePageNumber: 2 };
    const out = planVariantMigration(page, 0, newId());
    expect(out.page).toBe(page);
    expect(out.additional).toEqual([]);
  });

  it("leaves url as-is when there is no original variant, still converts regens", () => {
    const page: BookColoringPage = {
      id: "p2",
      url: "/only-regen.png",
      sourcePageNumber: 8,
      variants: [
        { id: "vA", url: "/only-regen.png", origin: "regen", source: "A", createdAt: "t" },
      ],
    };
    const out = planVariantMigration(page, 0, newId());
    expect(out.page.url).toBe("/only-regen.png"); // no original → url untouched
    expect("variants" in out.page).toBe(false);
    expect("selectedVariantId" in out.page).toBe(false);
    expect(out.additional).toHaveLength(1);
    expect(out.additional[0]).toMatchObject({ origin: "additional", parentPageNumber: 8, url: "/only-regen.png" });
  });

  it("restores the page to its original variant and converts regens to additional pages (no dup)", () => {
    const page: BookColoringPage = {
      id: "p1",
      url: "/regen-a.png",          // a regen variant is currently live (mirrored)
      coloredUrl: "/regen-a-c.png",
      sourcePageNumber: 3,
      selectedVariantId: "vA",
      variants: [
        { id: "vO", url: "/orig.png", origin: "original", createdAt: "t" },
        { id: "vA", url: "/regen-a.png", coloredUrl: "/regen-a-c.png", origin: "regen", source: "A", prompt: "sc", createdAt: "t" },
        { id: "vB", url: "/regen-b.png", origin: "regen", source: "B", createdAt: "t" },
      ],
    };
    const out = planVariantMigration(page, 4, newId());
    // page reverted to original line-art, variant fields stripped
    expect(out.page.url).toBe("/orig.png");
    expect("coloredUrl" in out.page).toBe(false);
    expect("variants" in out.page).toBe(false);
    expect("selectedVariantId" in out.page).toBe(false);
    // two additional pages under parent 3
    expect(out.additional).toHaveLength(2);
    expect(out.additional.every((p) => p.origin === "additional" && p.parentPageNumber === 3)).toBe(true);
    expect(out.additional[0]).toMatchObject({ url: "/regen-a.png", coloredUrl: "/regen-a-c.png", prompt: "sc" });
    expect(out.additional[1]).toMatchObject({ url: "/regen-b.png" });
    // the live regen url is NOT duplicated onto the restored page
    expect(out.page.url).not.toBe("/regen-a.png");
  });
});
