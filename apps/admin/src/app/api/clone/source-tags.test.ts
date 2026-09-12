import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
vi.mock("@vx/db", () => ({
  prisma: { cloneJob: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}));

import { readSourceTags } from "./source-tags";

describe("readSourceTags", () => {
  // `void` matters here: an expression-bodied arrow would implicitly return
  // findUnique.mockReset()'s return value (the mock itself, a function) —
  // Vitest documents that a function returned from beforeEach is registered
  // as a post-test cleanup callback. That accidentally re-invokes findUnique()
  // after every test, including "never throws" below, at a point where its
  // rejecting implementation is still armed — producing a real (if pointless)
  // unhandled rejection that fails the wrong test.
  beforeEach(() => void findUnique.mockReset());

  it("returns both tags when the source book has them", async () => {
    findUnique.mockResolvedValue({ sourceBook: { niche: "Cozy", priority: "1" } });
    expect(await readSourceTags("j1")).toEqual({ niche: "Cozy", priority: "1" });
  });

  it("omits the key entirely when a tag is null", async () => {
    findUnique.mockResolvedValue({ sourceBook: { niche: "Film", priority: null } });
    expect(await readSourceTags("j1")).toEqual({ niche: "Film" });
  });

  it("returns nothing when the job has no source book", async () => {
    findUnique.mockResolvedValue({ sourceBook: null });
    expect(await readSourceTags("j1")).toEqual({});
  });

  it("returns nothing when the job does not exist", async () => {
    findUnique.mockResolvedValue(null);
    expect(await readSourceTags("nope")).toEqual({});
  });

  it("never throws — book creation must not fail over a missing tag", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    findUnique.mockRejectedValue(new Error("db down"));

    expect(await readSourceTags("j1")).toEqual({});
    // Nuốt lỗi nhưng phải để lại dấu vết: book mất tag là truy được nguyên nhân.
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain("j1");

    warn.mockRestore();
  });

  it("trims and drops whitespace-only values", async () => {
    findUnique.mockResolvedValue({ sourceBook: { niche: "  Cozy  ", priority: "   " } });
    expect(await readSourceTags("j1")).toEqual({ niche: "Cozy" });
  });
});
