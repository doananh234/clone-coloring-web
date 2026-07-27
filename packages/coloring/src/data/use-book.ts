"use client";

import { useQuery } from "@tanstack/react-query";
import { httpGet } from "@vx/core-uikit/api";
import { COLORING_API_BASE } from "./config";
import { useBookPatch } from "./local-books";
import type { BookDetail } from "./types";

export interface UseBookResult {
  book: BookDetail | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/** Fetch a single book (GET {base}/books/[bookId], raw object). Read-only. */
export function useBook(bookId: string): UseBookResult {
  const query = useQuery({
    queryKey: ["coloring", "book", bookId],
    queryFn: () => httpGet<BookDetail>(`${COLORING_API_BASE}/books/${encodeURIComponent(bookId)}`),
    enabled: Boolean(bookId),
  });

  const patch = useBookPatch(bookId);
  const book = query.data ? { ...query.data, ...patch } : query.data;

  return {
    book,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
