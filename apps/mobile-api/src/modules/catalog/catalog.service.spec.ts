import { describe, expect, it } from "vitest";
import { buildBookWhere } from "./catalog.service";

describe("buildBookWhere", () => {
  it("always restricts to public books", () => {
    expect(buildBookWhere({})).toEqual({ isPublic: true });
  });
  it("adds categoryId and search OR", () => {
    const where = buildBookWhere({ categoryId: "c1", search: "dino" });
    expect(where.categoryId).toBe("c1");
    expect(where.OR).toEqual([
      { title: { contains: "dino", mode: "insensitive" } },
      { subtitle: { contains: "dino", mode: "insensitive" } },
    ]);
  });
  it("converts price bounds to minor units on priceAmount", () => {
    const where = buildBookWhere({ minPrice: "1", maxPrice: "9.5" });
    expect(where.priceAmount).toEqual({ gte: 100, lte: 950 });
  });
  it("merges extra where (e.g. category route)", () => {
    expect(buildBookWhere({}, { categoryId: "c9" }).categoryId).toBe("c9");
  });
});
