"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { httpGet } from "@vx/core-uikit/api";
import { COLORING_API_BASE } from "./config";
import type { BookRow } from "./types";

interface BooksResponse {
  data: BookRow[];
  meta?: { total?: number; page?: number; limit?: number; totalPages?: number };
}

export interface UseBooksResult {
  books: BookRow[];
  total: number;
  totalPages: number;
  page: number;
  isLoading: boolean;
  isError: boolean;
  refresh: () => void;
}

export interface BooksFilter {
  /** Full-text query across title + subtitle + niche (server-side). */
  q?: string;
  /** Exact category match. */
  cat?: string;
  /** "all" | "pub" | "draft". */
  status?: string;
  /** Assignment filter: "mine" (assigned to me) | "unassigned". */
  assign?: string;
}

/** Books list (GET {base}/books → { data, meta }). Filters run server-side. */
export function useBooks(page = 1, limit = 20, filter: BooksFilter = {}): UseBooksResult {
  const q = filter.q?.trim() ?? "";
  const cat = filter.cat ?? "";
  const status = filter.status && filter.status !== "all" ? filter.status : "";
  const assign = filter.assign && filter.assign !== "all" ? filter.assign : "";
  const query = useQuery({
    queryKey: ["coloring", "books", page, limit, q, cat, status, assign],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (q) params.set("q", q);
      if (cat) params.set("cat", cat);
      if (status) params.set("status", status);
      if (assign) params.set("assign", assign);
      return httpGet<BooksResponse>(`${COLORING_API_BASE}/books?${params.toString()}`);
    },
    // Keep showing the previous page/results while the next query loads so the
    // grid doesn't flash to a skeleton on every search/filter/pagination change.
    placeholderData: keepPreviousData,
  });

  const data = query.data?.data ?? [];
  const meta = query.data?.meta;

  return {
    books: data,
    total: meta?.total ?? data.length,
    totalPages: meta?.totalPages ?? 1,
    page: meta?.page ?? page,
    isLoading: query.isLoading,
    isError: query.isError,
    refresh: () => {
      void query.refetch();
    },
  };
}
