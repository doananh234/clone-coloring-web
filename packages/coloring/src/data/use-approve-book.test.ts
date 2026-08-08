import { describe, it, expect, vi, beforeEach } from "vitest";

const httpPost = vi.fn();
vi.mock("@vx/core-uikit/api", () => ({
  httpPost: (...a: unknown[]) => httpPost(...a),
  httpDel: vi.fn(),
}));

const invalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries }) }));

vi.mock("./config", () => ({ COLORING_API_BASE: "/coloring-api", COLORING_WRITE_ENABLED: true }));

import { useApproveBook } from "./use-book-actions";

describe("useApproveBook", () => {
  beforeEach(() => { httpPost.mockReset(); httpPost.mockResolvedValue({ success: true }); invalidateQueries.mockReset(); });

  it("POSTs to the approve endpoint and invalidates book + list", async () => {
    const approve = useApproveBook("b1");
    await approve();
    expect(httpPost).toHaveBeenCalledWith("/coloring-api/books/b1/approve", {});
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["coloring", "book", "b1"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["coloring", "books"] });
  });
});
