import { describe, it, expect } from "vitest";
import { interpolatePath } from "./interpolate-path";

describe("interpolatePath", () => {
  it("replaces single param", () => {
    expect(interpolatePath("/users/:id", { id: "123" })).toBe("/users/123");
  });

  it("replaces multiple params", () => {
    expect(
      interpolatePath("/users/:userId/posts/:postId", {
        userId: "1",
        postId: "42",
      })
    ).toBe("/users/1/posts/42");
  });

  it("encodes special characters", () => {
    expect(interpolatePath("/search/:query", { query: "hello world" })).toBe(
      "/search/hello%20world"
    );
  });

  it("throws on missing param", () => {
    expect(() => interpolatePath("/users/:id", {})).toThrow(
      "Missing path parameter: id"
    );
  });

  it("returns path unchanged when no params in template", () => {
    expect(interpolatePath("/users", {})).toBe("/users");
  });
});
