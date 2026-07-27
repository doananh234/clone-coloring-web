"use client";

import { useQuery } from "@tanstack/react-query";
import { httpGet } from "@vx/core-uikit/api";
import { COLORING_API_BASE } from "./config";
import type { EntityListItem, EntityListResponse } from "./types";

export interface UseEntityListResult {
  items: EntityListItem[];
  total: number;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Generic read-only list for simple `{ data: [...] }` entity endpoints
 * (characters, locations, art-styles, coloring-styles, brands…).
 */
export function useEntityList(path: string): UseEntityListResult {
  const query = useQuery({
    queryKey: ["coloring", "entity", path],
    queryFn: () => httpGet<EntityListResponse>(`${COLORING_API_BASE}/${path}`),
  });
  const items = query.data?.data ?? [];
  return {
    items,
    total: query.data?.meta?.total ?? items.length,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
