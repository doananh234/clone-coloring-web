"use client";

import { useQuery } from "@tanstack/react-query";
import { httpGet } from "@vx/core-uikit/api";
import type { CloneJobsResponse, CloneJobRow } from "./types";
import { COLORING_API_BASE } from "./config";

export interface UseCloneJobsResult {
  jobs: CloneJobRow[];
  /** Rows returned for this page (not the grand total — use `useJobCounts` for totals). */
  count: number;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Fetch clone jobs filtered by raw status SERVER-SIDE + paginated. This is the
 * LIST only — it passes `counts=0` so switching tabs/pages never recomputes or
 * clears the summary. The tab badges / totals come from `useJobCounts()`
 * (separate, cached), so they don't flash empty while the list refetches.
 *
 * Status filtering is essential: the server sorts pending first and there are
 * thousands, so a plain `limit=N` never reaches completed/stashed jobs.
 */
export function useCloneJobs(status = "all", limit = 50, page = 1): UseCloneJobsResult {
  const params = new URLSearchParams({ limit: String(limit), page: String(page), counts: "0" });
  if (status !== "all") params.set("status", status);
  const url = `${COLORING_API_BASE}/clone?${params.toString()}`;

  const query = useQuery({
    queryKey: ["coloring", "clone-jobs", status, limit, page],
    queryFn: () => httpGet<CloneJobsResponse>(url),
  });

  const jobs = query.data?.data ?? [];
  return {
    jobs,
    count: jobs.length,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
