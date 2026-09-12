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

});
