import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { createCrudPages } from "./create-crud-pages";
import type { FieldConfig } from "./types";

// Mock virtualizer so rows are rendered in jsdom (no real scroll container)
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({ index: i, key: i, start: i * 48, size: 48 })),
    getTotalSize: () => count * 48,
  }),
}));

vi.mock("../api/client", () => ({
  appApi: {
    get: vi.fn(),
    getAll: vi.fn().mockResolvedValue({
      data: [
        { id: "1", name: "Test Item", status: "active" },
      ],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    }),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

type TestEntity = {
  id: string;
  name: string;
  status: string;
};

const testFields: FieldConfig[] = [
  { name: "name", label: "Name", type: "text", sortable: true },
  { name: "status", label: "Status", type: "text" },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("createCrudPages", () => {
  it("returns ListPage, CreatePage, EditPage, DetailPage components", () => {
    const pages = createCrudPages<TestEntity>({
      entityName: "tests",
      basePath: "/tests",
      apiUrl: "/api/tests",
      fields: testFields,
    });
    expect(pages.ListPage).toBeDefined();
    expect(pages.CreatePage).toBeDefined();
    expect(pages.EditPage).toBeDefined();
    expect(pages.DetailPage).toBeDefined();
  });

  it("ListPage renders with data", async () => {
    const pages = createCrudPages<TestEntity>({
      entityName: "tests",
      basePath: "/tests",
      apiUrl: "/api/tests",
      fields: testFields,
    });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <pages.ListPage />
      </Wrapper>
    );
    expect(await screen.findByText("Test Item")).toBeTruthy();
  });

  it("CreatePage renders form fields", () => {
    const pages = createCrudPages<TestEntity>({
      entityName: "tests",
      basePath: "/tests",
      apiUrl: "/api/tests",
      fields: testFields,
    });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <pages.CreatePage />
      </Wrapper>
    );
    expect(screen.getByText("Name")).toBeTruthy();
    expect(screen.getByText("Status")).toBeTruthy();
  });
});
