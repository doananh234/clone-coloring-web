import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./http-client", () => ({
  httpGet: vi.fn(),
  httpPost: vi.fn(),
  httpPut: vi.fn(),
  httpPatch: vi.fn(),
  httpDel: vi.fn(),
}));

import { appApi } from "./client";
import { httpGet, httpPost, httpPut, httpPatch, httpDel } from "./http-client";

describe("appApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("get() calls httpGet with url", async () => {
    vi.mocked(httpGet).mockResolvedValueOnce({ id: "1" });
    const result = await appApi.get("/users/1");
    expect(result).toEqual({ id: "1" });
    expect(httpGet).toHaveBeenCalledWith("/users/1");
  });

  it("getAll() builds query params from ListParams", async () => {
    vi.mocked(httpGet).mockResolvedValueOnce({ data: [], meta: {} });
    await appApi.getAll("/users", {
      page: 2,
      limit: 10,
      sort: [{ field: "name", order: "asc" }],
      filters: { role: "admin" },
    });
    expect(httpGet).toHaveBeenCalledWith(
      "/users?page=2&limit=10&sort=%5B%7B%22field%22%3A%22name%22%2C%22order%22%3A%22asc%22%7D%5D&filters=%7B%22role%22%3A%22admin%22%7D"
    );
  });

  it("post() calls httpPost with url and data", async () => {
    const data = { name: "Test" };
    vi.mocked(httpPost).mockResolvedValueOnce({ id: "1", ...data });
    await appApi.post("/users", data);
    expect(httpPost).toHaveBeenCalledWith("/users", data);
  });

  it("put() calls httpPut with url and data", async () => {
    vi.mocked(httpPut).mockResolvedValueOnce({});
    await appApi.put("/users/1", { name: "Updated" });
    expect(httpPut).toHaveBeenCalledWith("/users/1", { name: "Updated" });
  });

  it("patch() calls httpPatch with url and data", async () => {
    vi.mocked(httpPatch).mockResolvedValueOnce({});
    await appApi.patch("/users/1", { name: "Patched" });
    expect(httpPatch).toHaveBeenCalledWith("/users/1", { name: "Patched" });
  });

  it("delete() calls httpDel with url", async () => {
    vi.mocked(httpDel).mockResolvedValueOnce({});
    await appApi.delete("/users/1");
    expect(httpDel).toHaveBeenCalledWith("/users/1", undefined);
  });
});
