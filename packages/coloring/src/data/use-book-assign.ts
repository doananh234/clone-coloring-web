"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { httpGet, httpPost } from "@vx/core-uikit/api";
import { COLORING_API_BASE } from "./config";

export interface OperatorLite {
  id: string;
  username: string;
  name: string;
  role: string;
}

interface OperatorsResponse {
  data: OperatorLite[];
}

/** Operators list — admin-only endpoint; members get 403 → empty list. */
export function useOperators(enabled: boolean): OperatorLite[] {
  const query = useQuery({
    queryKey: ["coloring", "operators"],
    queryFn: () => httpGet<OperatorsResponse>(`${COLORING_API_BASE}/operators`),
    enabled,
    retry: false,
  });
  return query.data?.data ?? [];
}

/** Assign / unassign books, then refresh the book list. */
export function useBookAssign() {
  const qc = useQueryClient();
  return {
    assign: async (bookIds: string[], assigneeId: string | null) => {
      await httpPost(`${COLORING_API_BASE}/books/assign`, { bookIds, assigneeId });
      await qc.invalidateQueries({ queryKey: ["coloring", "books"] });
    },
  };
}
