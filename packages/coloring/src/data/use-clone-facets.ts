"use client";

import { useQuery } from "@tanstack/react-query";
import { httpGet } from "@vx/core-uikit/api";
import { COLORING_API_BASE } from "./config";

export interface CloneFacets {
  niches: string[];
  priorities: string[];
}

/** Giá trị có thật cho dropdown lọc. Ít đổi nên cache dài, dùng chung cho cả
 *  trang jobs lẫn trang books. */
export function useCloneFacets(): CloneFacets {
  const query = useQuery({
    queryKey: ["coloring", "clone-facets"],
    queryFn: () => httpGet<CloneFacets>(`${COLORING_API_BASE}/clone/facets`),
    staleTime: 5 * 60 * 1000,
  });
  return { niches: query.data?.niches ?? [], priorities: query.data?.priorities ?? [] };
}
