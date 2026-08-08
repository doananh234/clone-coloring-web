import { describe, it, expect, vi, beforeEach } from "vitest";

const httpDel = vi.fn();
vi.mock("@vx/core-uikit/api", () => ({ httpDel: (...a: unknown[]) => httpDel(...a) }));

const invalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries }) }));

// Force the write flag ON for the module under test.
vi.mock("./config", () => ({
  COLORING_API_BASE: "/coloring-api",
  COLORING_WRITE_ENABLED: true,
}));

import { useEntityBulkDelete } from "./use-entity-bulk-delete";

describe("useEntityBulkDelete", () => {
  beforeEach(() => { httpDel.mockReset(); httpDel.mockResolvedValue({}); invalidateQueries.mockReset(); });

  it("fires one DELETE per id and invalidates the entity list", async () => {
    const { removeMany, enabled } = useEntityBulkDelete("coloring-styles");
    expect(enabled).toBe(true);
    await removeMany(["a", "b b"]);
    expect(httpDel).toHaveBeenCalledTimes(2);
    expect(httpDel).toHaveBeenCalledWith("/coloring-api/coloring-styles/a");
    expect(httpDel).toHaveBeenCalledWith("/coloring-api/coloring-styles/b%20b"); // id encoded
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["coloring", "entity", "coloring-styles"] });
  });
});
