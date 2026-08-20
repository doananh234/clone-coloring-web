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
  /** Assignment filter: "mine" (assigned to me) | "assigned" (has any assignee) | "unassigned". */
  assign?: string;
  /** Specific operator id — only books assigned to that operator (admin queue board). */
  assignee?: string;
  /** "1" → only books that have Etsy listing content (data.etsyListing). */
  etsy?: string;
  /** "gt40" → only books with more than 40 interior pages. */
  interior?: string;
}

/** Books list (GET {base}/books → { data, meta }). Filters run server-side. */
export function useBooks(page = 1, limit = 20, filter: BooksFilter = {}): UseBooksResult {
  const q = filter.q?.trim() ?? "";
  const cat = filter.cat ?? "";
  const status = filter.status && filter.status !== "all" ? filter.status : "";
  const assign = filter.assign && filter.assign !== "all" ? filter.assign : "";
  const assignee = filter.assignee ?? "";
  const etsy = filter.etsy ?? "";
  const interior = filter.interior && filter.interior !== "" ? filter.interior : "";
  const query = useQuery({
    queryKey: ["coloring", "books", page, limit, q, cat, status, assign, assignee, etsy, interior],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (q) params.set("q", q);
      if (cat) params.set("cat", cat);
      if (status) params.set("status", status);
      if (assign) params.set("assign", assign);
      if (assignee) params.set("assignee", assignee);
      if (etsy) params.set("etsy", etsy);
      if (interior) params.set("interior", interior);
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
