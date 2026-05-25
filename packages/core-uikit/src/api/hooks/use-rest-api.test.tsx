import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../client", () => ({
  appApi: {
    get: vi.fn(),
    getAll: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import {
  useRestGetAll,
  useRestGetOne,
  useRestMutation,
} from "./use-rest-api";
import { appApi } from "../client";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useRestGetAll", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches paginated data", async () => {
    const mockResponse = {
      data: [{ id: "1", name: "User 1" }],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    };
    vi.mocked(appApi.getAll).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(
      () => useRestGetAll({ entityName: "users", url: "/users" }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual([{ id: "1", name: "User 1" }]);
    expect(result.current.meta).toEqual(mockResponse.meta);
  });
});

describe("useRestGetOne", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches single entity by path params", async () => {
    const mockUser = { id: "1", name: "User 1" };
    vi.mocked(appApi.get).mockResolvedValueOnce(mockUser);

    const { result } = renderHook(
      () =>
        useRestGetOne({
          entityName: "users",
          url: "/users/:id",
          pathParams: { id: "1" },
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(mockUser);
  });
});

describe("useRestMutation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("performs POST mutation", async () => {
    const newUser = { id: "2", name: "New User" };
    vi.mocked(appApi.post).mockResolvedValueOnce(newUser);

    const { result } = renderHook(
      () =>
        useRestMutation({
          entityName: "users",
          url: "/users",
          method: "POST",
        }),
      { wrapper: createWrapper() }
    );

    result.current.mutate({ name: "New User" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(newUser);
  });
});
