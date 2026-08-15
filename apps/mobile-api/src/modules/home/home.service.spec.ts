import { describe, expect, it } from "vitest";
import { resolveConfig, type HomeBook } from "./home.service";

const book: HomeBook = { id: "b1", title: "Dino", coverUrl: "u", priceAmount: 500 };

describe("resolveConfig", () => {
  it("drops book ids that aren't public/resolved", () => {
    const out = resolveConfig(
      { sections: [{ title: "Top", bookIds: ["b1", "missing"] }] },
      new Map([["b1", book]]),
      new Map(),
    );
    expect(out.sections[0].books).toEqual([book]);
  });
  it("passes banners through and resolves featured categories", () => {
    const out = resolveConfig(
      { banners: [{ img: "x" }], featuredCategoryIds: ["c1"] },
      new Map(),
      new Map([["c1", { id: "c1" }]]),
    );
    expect(out.banners).toEqual([{ img: "x" }]);
    expect(out.featuredCategories).toEqual([{ id: "c1" }]);
  });
});
