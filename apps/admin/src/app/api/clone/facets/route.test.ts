import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
vi.mock("@vx/db", () => ({
  prisma: { sourceBook: { findMany: (...a: unknown[]) => findMany(...a) } },
}));

import { GET } from "./route";

describe("GET /api/clone/facets", () => {
  beforeEach(() => findMany.mockReset());

  it("returns distinct niches and priorities without nulls", async () => {
    findMany
      .mockResolvedValueOnce([{ niche: "Cozy" }, { niche: "Film" }])
      .mockResolvedValueOnce([{ priority: "1" }, { priority: "2" }]);

    const res = await GET();
    expect(await res.json()).toEqual({
      niches: ["Cozy", "Film"],
      priorities: ["1", "2"],
    });
  });

  it("returns empty lists rather than failing when nothing is tagged", async () => {
    findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const res = await GET();
    expect(await res.json()).toEqual({ niches: [], priorities: [] });
  });

  it("responds 500 when the query throws", async () => {
    findMany.mockRejectedValueOnce(new Error("db down"));

    const res = await GET();
    expect(res.status).toBe(500);
  });
});
