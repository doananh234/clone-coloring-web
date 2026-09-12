import { describe, it, expect } from "vitest";
import { bookTagClause } from "./filters";
import { BLANK } from "../clone/filters";

describe("bookTagClause", () => {
  it("matches a concrete niche on the denormalized column", () => {
    expect(bookTagClause("niche", "Cozy")).toEqual({ niche: "Cozy" });
  });

  it("matches a concrete priority", () => {
    expect(bookTagClause("priority", "1")).toEqual({ priority: "1" });
  });

  it("maps the blank sentinel to a null column check", () => {
    expect(bookTagClause("niche", BLANK)).toEqual({ niche: null });
    expect(bookTagClause("priority", BLANK)).toEqual({ priority: null });
  });
});
