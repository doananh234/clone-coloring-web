"use client";

import { useQuery } from "@tanstack/react-query";
import { httpGet } from "@vx/core-uikit/api";
import { COLORING_API_BASE } from "./config";
import type { StyleUsage } from "./group-style-usages";

export interface UseStyleUsagesResult {
  usages: StyleUsage[];
  isLoading: boolean;
  isError: boolean;
}

/** Read-only: the book pages colorized with `styleId` (GET .../coloring-styles/{id}/usages). */
export function useStyleUsages(styleId: string): UseStyleUsagesResult {
  const query = useQuery({
    queryKey: ["coloring", "style-usages", styleId],
    queryFn: () =>
      httpGet<{ usages: StyleUsage[] }>(
        `${COLORING_API_BASE}/coloring-styles/${encodeURIComponent(styleId)}/usages`,
      ),
    enabled: Boolean(styleId),
  });
  return { usages: query.data?.usages ?? [], isLoading: query.isLoading, isError: query.isError };
}
