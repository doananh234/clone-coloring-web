import { describe, it, expect } from "vitest";
import { applyVariantSelection } from "./use-page-variants";
import type { BookDetail } from "./types";

function book(): BookDetail {
  return {
    id: "b1",
    title: "T",
    coloringPages: [
      {
        id: "p1",
        url: "/orig-1.png",
        coloredUrl: "/orig-1-c.png",
        selectedVariantId: "v0",
        variants: [
          { id: "v0", url: "/orig-1.png", coloredUrl: "/orig-1-c.png", origin: "original", createdAt: "" },
          { id: "v1", url: "/regen-1.png", coloredUrl: "/regen-1-c.png", origin: "regen", createdAt: "" },
          { id: "v2", url: "/regen-2.png", origin: "regen", createdAt: "" },
        ],
      },
      { id: "p2", url: "/orig-2.png", variants: [], selectedVariantId: undefined },
    ],
  } as unknown as BookDetail;
}

describe("applyVariantSelection", () => {
  it("mirrors the chosen variant's url + coloredUrl into the page", () => {
    const next = applyVariantSelection(book(), "p1", "v1")!;
    const p1 = next.coloringPages!.find((p) => p.id === "p1")!;
    expect(p1.selectedVariantId).toBe("v1");
    expect(p1.url).toBe("/regen-1.png");
    expect(p1.coloredUrl).toBe("/regen-1-c.png");
  });

  it("clears coloredUrl when the chosen variant has none", () => {
    const next = applyVariantSelection(book(), "p1", "v2")!;
    const p1 = next.coloringPages!.find((p) => p.id === "p1")!;
    expect(p1.url).toBe("/regen-2.png");
    expect(p1.coloredUrl).toBeUndefined();
  });

  it("leaves other pages untouched", () => {
    const src = book();
    const next = applyVariantSelection(src, "p1", "v1")!;
    const p2 = next.coloringPages!.find((p) => p.id === "p2")!;
    expect(p2).toBe(src.coloringPages![1]); // same reference — not re-created
  });

  it("sets selectedVariantId even if the variant id is not in the list", () => {
    const next = applyVariantSelection(book(), "p1", "ghost")!;
    const p1 = next.coloringPages!.find((p) => p.id === "p1")!;
    expect(p1.selectedVariantId).toBe("ghost");
    expect(p1.url).toBe("/orig-1.png"); // url unchanged when no match
  });

  it("returns the input unchanged when there are no coloringPages", () => {
    const b = { id: "b1", title: "T" } as unknown as BookDetail;
    expect(applyVariantSelection(b, "p1", "v1")).toBe(b);
    expect(applyVariantSelection(undefined, "p1", "v1")).toBeUndefined();
  });
});
