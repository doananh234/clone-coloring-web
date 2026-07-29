"use client";

import { useQuery } from "@tanstack/react-query";
import { httpGet } from "@vx/core-uikit/api";
import { COLORING_API_BASE } from "./config";

/** Resolve the clone job that produced a book (GET {base}/books/[bookId]/job). */
export function useBookJob(bookId: string): { jobId: string | null; isLoading: boolean } {
  const query = useQuery({
    queryKey: ["coloring", "book-job", bookId],
    queryFn: () => httpGet<{ jobId: string | null }>(`${COLORING_API_BASE}/books/${encodeURIComponent(bookId)}/job`),
    enabled: Boolean(bookId),
    staleTime: 5 * 60 * 1000,
  });
  return { jobId: query.data?.jobId ?? null, isLoading: query.isLoading };
}
