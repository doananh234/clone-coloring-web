"use client";

import { useQuery } from "@tanstack/react-query";
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

/** Books list (GET {base}/books → { data, meta }). */
export function useBooks(page = 1, limit = 20): UseBooksResult {
  const query = useQuery({
    queryKey: ["coloring", "books", page, limit],
    queryFn: () => httpGet<BooksResponse>(`${COLORING_API_BASE}/books?page=${page}&limit=${limit}`),
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
