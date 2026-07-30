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

/** Admin operator list (GET /api/operators — same-origin, admin-gated). */
export function useOperators() {
  const query = useQuery({
    queryKey: ["operators"],
    queryFn: () => httpGet<OperatorsResponse>("/api/operators"),
  });
  return {
    operators: query.data?.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refresh: () => query.refetch(),
  };
}
