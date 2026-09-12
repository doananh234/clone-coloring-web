"use client";

import { useQuery } from "@tanstack/react-query";
import { httpGet } from "@vx/core-uikit/api";
import type { CloneJobsResponse, CloneJobRow } from "./types";
import { COLORING_API_BASE } from "./config";

export interface CloneJobsFilter {
  /** Niche chính xác, hoặc "__blank__" cho job chưa gắn niche. */
  niche?: string;
  /** Priority chính xác, hoặc "__blank__" cho job chưa gắn priority. */
  priority?: string;
}

export interface UseCloneJobsResult {
  jobs: CloneJobRow[];
  /** Rows returned for this page (not the grand total — use `useJobCounts` for totals). */
  count: number;
  /** Tổng số job khớp filter tag, do server đếm. Null khi không lọc theo tag —
   *  lúc đó số trang vẫn lấy từ cached status counts như trước. */
  total: number | null;
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
 * Filter niche/priority cũng chạy server-side (join sang SourceBook) — lọc phía
 * client sẽ chỉ thấy 50 dòng của trang hiện tại.
 */
export function useCloneJobs(
  status = "all",
  limit = 50,
  page = 1,
  filter: CloneJobsFilter = {},
): UseCloneJobsResult {
  const niche = filter.niche ?? "";
  const priority = filter.priority ?? "";

  const params = new URLSearchParams({ limit: String(limit), page: String(page), counts: "0" });
  if (status !== "all") params.set("status", status);
  if (niche) params.set("niche", niche);
  if (priority) params.set("priority", priority);
  const url = `${COLORING_API_BASE}/clone?${params.toString()}`;

  const query = useQuery({
    queryKey: ["coloring", "clone-jobs", status, limit, page, niche, priority],
    queryFn: () => httpGet<CloneJobsResponse>(url),
  });

  const jobs = query.data?.data ?? [];
  return {
    jobs,
    count: jobs.length,
    total: query.data?.total ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
