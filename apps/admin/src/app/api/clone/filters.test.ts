import { describe, it, expect } from "vitest";
import { buildCloneJobWhere, BLANK } from "./filters";

describe("buildCloneJobWhere", () => {
  it("returns undefined when nothing is filtered", () => {
    expect(buildCloneJobWhere({ status: "all" })).toBeUndefined();
    expect(buildCloneJobWhere({})).toBeUndefined();
  });

  it("filters by status alone", () => {
    expect(buildCloneJobWhere({ status: "pending" })).toEqual({
      AND: [{ status: "pending" }],
    });
  });

  it("matches a concrete niche through the relation", () => {
    expect(buildCloneJobWhere({ niche: "Cozy" })).toEqual({
      AND: [{ sourceBook: { is: { niche: "Cozy" } } }],
    });
  });

  it("matches blank niche via both unlinked jobs and null field", () => {
    expect(buildCloneJobWhere({ niche: BLANK })).toEqual({
      AND: [
        { OR: [{ sourceBookId: null }, { sourceBook: { is: { niche: null } } }] },
      ],
    });
  });

  it("matches blank priority the same way", () => {
    expect(buildCloneJobWhere({ priority: BLANK })).toEqual({
      AND: [
        { OR: [{ sourceBookId: null }, { sourceBook: { is: { priority: null } } }] },
      ],
    });
  });

  it("ANDs status with both tag filters", () => {
    expect(buildCloneJobWhere({ status: "pending", niche: "Film", priority: "1" })).toEqual({
      AND: [
        { status: "pending" },
        { sourceBook: { is: { niche: "Film" } } },
        { sourceBook: { is: { priority: "1" } } },
      ],
    });
  });

  it("ignores empty strings and nulls", () => {
    expect(buildCloneJobWhere({ status: "", niche: "", priority: null })).toBeUndefined();
  });

  it("searches name and id case-insensitively", () => {
    expect(buildCloneJobWhere({ q: "coco" })).toEqual({
      AND: [
        {
          OR: [
            { name: { contains: "coco", mode: "insensitive" } },
            { id: { contains: "coco", mode: "insensitive" } },
          ],
        },
      ],
    });
  });

  it("adds the source-matched ids as a third search branch", () => {
    expect(buildCloneJobWhere({ q: "plat", brandMatchIds: ["a", "b"] })).toEqual({
      AND: [
        {
          OR: [
            { name: { contains: "plat", mode: "insensitive" } },
            { id: { contains: "plat", mode: "insensitive" } },
            { id: { in: ["a", "b"] } },
          ],
        },
      ],
    });
  });

  it("trims the query and ignores a blank one", () => {
    expect(buildCloneJobWhere({ q: "   " })).toBeUndefined();
    expect(buildCloneJobWhere({ q: " coco " })).toEqual(buildCloneJobWhere({ q: "coco" }));
  });

  it("matches a source exactly through the JSON brand key", () => {
    expect(buildCloneJobWhere({ source: "Búsqueda y Plática" })).toEqual({
      AND: [{ data: { path: ["brand"], equals: "Búsqueda y Plática" } }],
    });
  });

  it("ANDs search and source with the other filters", () => {
    const where = buildCloneJobWhere({ status: "pending", niche: "Cozy", q: "x", source: "S" });
    expect(where?.AND).toHaveLength(4);
  });

});
