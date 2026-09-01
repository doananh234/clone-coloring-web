"use client";

import { useQuery } from "@tanstack/react-query";
import { httpGet } from "@vx/core-uikit/api";

export interface OperatorRow {
  id: string;
  username: string;
  name: string;
  role: string;
  disabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface OperatorsResponse {
  data: OperatorRow[];
}

/**
 * Admin operator list (GET /operators — admin-gated). Shares the query key
 * `["coloring","operators"]` with the lighter `useOperators` in use-book-assign
 * so the operator list is fetched ONCE and cached across the operators screen,
 * the books screen, and the queue board (was two keys = a double fetch).
 */
export function useOperators() {
  const query = useQuery({
    queryKey: ["coloring", "operators"],
    // Operators are LOCAL admin-panel accounts — always the same-origin /api,
    // never the coloring content upstream (which may proxy to prod). Mirrors the
    // hardcoded /api/operators in useOperatorActions.
    queryFn: () => httpGet<OperatorsResponse>("/api/operators"),
  });
  return {
    operators: query.data?.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refresh: () => query.refetch(),
  };
}
