import { describe, it, expect } from "vitest";
import { ensureOriginalVariant, addVariants, selectVariant, deleteVariant, type VariantPage } from "./page-variants";
import type { PageVariant } from "./types";

const regen = (id: string): PageVariant => ({ id, url: `/r/${id}.png`, origin: "regen", source: "A", createdAt: "t" });

describe("ensureOriginalVariant", () => {
  it("seeds the original from url/coloredUrl when variants is empty and selects it", () => {
    const { page, originalId } = ensureOriginalVariant(
      { url: "/base.png", coloredUrl: "/base-c.png" }, () => "orig", "t0",
    );
    expect(page.variants).toEqual([
      { id: "orig", url: "/base.png", coloredUrl: "/base-c.png", origin: "original", createdAt: "t0" },
    ]);
    expect(page.selectedVariantId).toBe("orig");
    expect(originalId).toBe("orig");
  });

  it("is a no-op when an original already exists (returns its id)", () => {
    const existing: VariantPage = {
      url: "/base.png",
      variants: [{ id: "o1", url: "/base.png", origin: "original", createdAt: "t" }, regen("r1")],
      selectedVariantId: "o1",
    };
    const { page, originalId } = ensureOriginalVariant(existing, () => "NEW", "t9");
    expect(originalId).toBe("o1");
    expect(page.variants).toHaveLength(2);
  });
});

describe("addVariants", () => {
  it("appends without changing the selection", () => {
    const page: VariantPage = {
      url: "/base.png",
      variants: [{ id: "o1", url: "/base.png", origin: "original", createdAt: "t" }],
      selectedVariantId: "o1",
    };
    const out = addVariants(page, [regen("r1"), regen("r2")]);
    expect(out.variants!.map((v) => v.id)).toEqual(["o1", "r1", "r2"]);
    expect(out.selectedVariantId).toBe("o1");
  });
});

describe("selectVariant", () => {
  it("mirrors the chosen variant's url + coloredUrl onto the page", () => {
    const page: VariantPage = {
      url: "/base.png",
      coloredUrl: "/base-c.png",
      variants: [
        { id: "o1", url: "/base.png", coloredUrl: "/base-c.png", origin: "original", createdAt: "t" },
        { id: "r1", url: "/r/r1.png", origin: "regen", source: "A", createdAt: "t" },
      ],
      selectedVariantId: "o1",
    };
    const out = selectVariant(page, "r1");
    expect(out.selectedVariantId).toBe("r1");
    expect(out.url).toBe("/r/r1.png");
    expect(out.coloredUrl).toBeUndefined(); // r1 has no coloredUrl → page clears it
  });

  it("throws when the variant id is unknown", () => {
    const page: VariantPage = { url: "/base.png", variants: [regen("r1")], selectedVariantId: "r1" };
    expect(() => selectVariant(page, "nope")).toThrow();
  });
});

describe("deleteVariant", () => {
  const base = (): VariantPage => ({
    url: "/base.png",
    variants: [
      { id: "o1", url: "/base.png", origin: "original", createdAt: "t" },
      regen("r1"),
      regen("r2"),
    ],
    selectedVariantId: "o1",
  });

  it("removes a non-selected regen variant", () => {
    const out = deleteVariant(base(), "r2");
    expect(out.variants!.map((v) => v.id)).toEqual(["o1", "r1"]);
  });
  it("refuses to delete the selected variant", () => {
    const p = base(); p.selectedVariantId = "r1";
    expect(() => deleteVariant(p, "r1")).toThrow();
  });
  it("refuses to delete the original", () => {
    expect(() => deleteVariant(base(), "o1")).toThrow();
  });
});
