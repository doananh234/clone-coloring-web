import { describe, it, expect, vi } from "vitest";
import { resolveBrand, resolveBrandInfo } from "./one-shot";

function fakeDb(overrides?: {
  findUnique?: unknown;
  findFirstByName?: unknown;
  findFirstFallback?: unknown;
}) {
  const findUnique = vi.fn().mockResolvedValue(overrides?.findUnique ?? null);
  const findFirst = vi.fn().mockImplementation((arg?: { where?: { name?: string } }) => {
    if (arg?.where?.name) return overrides?.findFirstByName ?? null;
    return overrides?.findFirstFallback ?? null;
  });
  return { brand: { findUnique, findFirst } } as never;
}

describe("resolveBrand", () => {
  it("prefers brandId lookup when present", async () => {
    const db = fakeDb({
      findUnique: { id: "b1", name: "Brand One", data: { coloringStyleId: "cs1" } },
    });
    const job = { id: "j1", data: { brandId: "b1", brand: "STALE NAME" } };
    const result = await resolveBrand(job, db);
    expect(result).toEqual({ id: "b1", name: "Brand One", data: { coloringStyleId: "cs1" } });
  });

  it("falls back to name lookup when brandId missing", async () => {
    const db = fakeDb({
      findFirstByName: { id: "b2", name: "By Name", data: {} },
    });
    const job = { id: "j2", data: { brand: "By Name" } };
    const result = await resolveBrand(job, db);
    expect(result?.id).toBe("b2");
  });

  it("falls back to first brand when both brandId and name missing", async () => {
    const db = fakeDb({
      findFirstFallback: { id: "b3", name: "First", data: {} },
    });
    const job = { id: "j3", data: {} };
    const result = await resolveBrand(job, db);
    expect(result?.id).toBe("b3");
  });

  it("returns null when nothing matches and no brands exist", async () => {
    const db = fakeDb({});
    const job = { id: "j4", data: {} };
    const result = await resolveBrand(job, db);
    expect(result).toBeNull();
  });
});

describe("resolveBrandInfo (thin wrapper)", () => {
  it("returns the brand name for backward compatibility with Diaflow", async () => {
    const db = fakeDb({
      findUnique: { id: "b1", name: "Brand One", data: {} },
    });
    const job = { id: "j1", data: { brandId: "b1" } };
    const name = await resolveBrandInfo(job, db);
    expect(name).toBe("Brand One");
  });

  it("returns undefined when no brand resolves", async () => {
    const db = fakeDb({});
    const job = { id: "j1", data: {} };
    const name = await resolveBrandInfo(job, db);
    expect(name).toBeUndefined();
  });
});
