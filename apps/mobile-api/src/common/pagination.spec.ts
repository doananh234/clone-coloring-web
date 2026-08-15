import { describe, expect, it } from "vitest";
import { parseListQuery, parseSort, toPage } from "./pagination";

describe("pagination", () => {
  it("defaults page=1 limit=20", () => {
    expect(parseListQuery({})).toEqual({ page: 1, limit: 20, skip: 0 });
  });
  it("clamps limit to 100 and computes skip", () => {
    expect(parseListQuery({ page: "3", limit: "500" })).toEqual({ page: 3, limit: 100, skip: 200 });
  });
  it("parseSort whitelists fields and defaults dir to desc", () => {
    expect(parseSort("title:asc", ["title", "createdAt"], "createdAt:desc")).toEqual({ title: "asc" });
    expect(parseSort("hacker:asc", ["title", "createdAt"], "createdAt:desc")).toEqual({ createdAt: "asc" });
    expect(parseSort(undefined, ["createdAt"], "createdAt:desc")).toEqual({ createdAt: "desc" });
  });
  it("toPage wraps data + meta", () => {
    expect(toPage([1, 2], 5, { page: 1, limit: 20, skip: 0 })).toEqual({
      data: [1, 2],
      meta: { total: 5, page: 1, limit: 20 },
    });
  });
});
